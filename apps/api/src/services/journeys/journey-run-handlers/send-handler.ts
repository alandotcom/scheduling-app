import { type JourneyRunMode } from "@scheduling/dto";
import { journeyDeliveries } from "@scheduling/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { retry } from "es-toolkit/function";
import { withOrg } from "../../../lib/db.js";
import {
  JourneyDeliveryNonRetryableError,
  type JourneyDeliveryDispatcher,
  type JourneyDeliveryDispatchInput,
} from "../delivery-dispatch-helpers.js";
import { getProviderForActionType } from "../delivery-provider-registry.js";
import { getActionConfig, resolveChannel } from "../journey-graph-walk.js";
import {
  appendJourneyRunEvent,
  upsertJourneyRunStepLog,
} from "../journey-run-artifacts.js";
import type {
  NodeExecutionContext,
  NodeHandlerResult,
} from "./handler-types.js";

// The send node handler. A delivery is three ordered durable steps so the
// non-idempotent provider send is isolated: (1) record the delivery row in
// `planned` (so a status callback always finds a row, and the delivery id is
// stable across replays), (2) dispatch — the only non-idempotent effect, memoized
// so a later failure never re-sends, (3) finalize the projection from the memoized
// send result. The walk advances regardless of async-callback state.

type SendResult = {
  providerMessageId: string | null;
  reasonCode: string | null;
  awaitingAsyncCallback: boolean;
  attempts: number;
};

async function prepareSend(input: {
  orgId: string;
  runId: string;
  stepKey: string;
  actionType: string;
  channel: string;
  scheduledFor: Date;
  deterministicKey: string;
}): Promise<string> {
  return withOrg(input.orgId, async (tx) => {
    const [inserted] = await tx
      .insert(journeyDeliveries)
      .values({
        orgId: input.orgId,
        journeyRunId: input.runId,
        stepKey: input.stepKey,
        channel: input.channel,
        actionType: input.actionType,
        scheduledFor: input.scheduledFor,
        status: "planned",
        deterministicKey: input.deterministicKey,
      })
      .onConflictDoNothing({
        target: [journeyDeliveries.orgId, journeyDeliveries.deterministicKey],
      })
      .returning({ id: journeyDeliveries.id });

    let deliveryId = inserted?.id;
    if (!deliveryId) {
      const [existing] = await tx
        .select({ id: journeyDeliveries.id })
        .from(journeyDeliveries)
        .where(
          and(
            eq(journeyDeliveries.orgId, input.orgId),
            eq(journeyDeliveries.deterministicKey, input.deterministicKey),
          ),
        )
        .limit(1);
      if (!existing) {
        throw new Error("Delivery row missing after conflict during prepare.");
      }
      deliveryId = existing.id;
    }

    await upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.stepKey,
      nodeType: input.actionType,
      status: "running",
      startedAt: input.scheduledFor,
      completedAt: null,
      durationMs: null,
      logInput: {
        channel: input.channel,
        idempotencyKey: input.deterministicKey,
      },
      logOutput: { status: "planned" },
    });

    return deliveryId;
  });
}

async function dispatchSendOnly(input: {
  orgId: string;
  runId: string;
  stepKey: string;
  actionType: string;
  channel: string;
  journeyDeliveryId: string;
  deterministicKey: string;
  stepConfig: Record<string, unknown>;
  mode: JourneyRunMode;
  triggerEntityType: "appointment" | "client";
  appointmentId: string | null;
  clientId: string | null;
  dispatchDelivery: JourneyDeliveryDispatcher;
  maxDispatchAttempts: number;
}): Promise<SendResult> {
  const dispatchPayload: JourneyDeliveryDispatchInput = {
    orgId: input.orgId,
    journeyDeliveryId: input.journeyDeliveryId,
    journeyRunId: input.runId,
    channel: input.channel,
    idempotencyKey: input.deterministicKey,
    runMode: input.mode,
    stepConfig: input.stepConfig,
    triggerEntityType: input.triggerEntityType,
    ...(input.appointmentId != null
      ? { appointmentId: input.appointmentId }
      : {}),
    ...(input.clientId != null ? { clientId: input.clientId } : {}),
  };

  const maxAttempts =
    getProviderForActionType(input.actionType)?.maxDispatchAttempts ??
    input.maxDispatchAttempts;
  let attempts = 0;
  const dispatched = await retry(
    async () => {
      attempts++;
      return input.dispatchDelivery(dispatchPayload);
    },
    {
      retries: maxAttempts,
      shouldRetry: (error) =>
        !(error instanceof JourneyDeliveryNonRetryableError),
    },
  );

  return {
    providerMessageId:
      typeof dispatched.providerMessageId === "string"
        ? dispatched.providerMessageId
        : null,
    reasonCode: dispatched.reasonCode ?? null,
    awaitingAsyncCallback: dispatched.awaitingAsyncCallback === true,
    attempts,
  };
}

async function finalizeSend(input: {
  orgId: string;
  runId: string;
  stepKey: string;
  actionType: string;
  channel: string;
  deterministicKey: string;
  scheduledFor: Date;
  result: SendResult;
}): Promise<void> {
  const awaitingCallback = input.result.awaitingAsyncCallback;

  await withOrg(input.orgId, async (tx) => {
    await tx
      .update(journeyDeliveries)
      .set({
        status: awaitingCallback ? "planned" : "sent",
        reasonCode: input.result.reasonCode,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(journeyDeliveries.orgId, input.orgId),
          eq(journeyDeliveries.deterministicKey, input.deterministicKey),
        ),
      );

    await upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.stepKey,
      nodeType: input.actionType,
      status: awaitingCallback ? "running" : "success",
      startedAt: input.scheduledFor,
      completedAt: awaitingCallback ? null : input.scheduledFor,
      durationMs: awaitingCallback ? null : 0,
      logInput: {
        channel: input.channel,
        idempotencyKey: input.deterministicKey,
      },
      logOutput: {
        status: awaitingCallback ? "planned" : "sent",
        attempts: input.result.attempts,
        reasonCode: input.result.reasonCode,
        providerMessageId: input.result.providerMessageId,
        ...(awaitingCallback
          ? { providerState: "accepted_pending_callback" }
          : {}),
      },
    });

    await appendJourneyRunEvent({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      eventType: awaitingCallback
        ? "delivery_provider_accepted"
        : "delivery_sent",
      message: awaitingCallback
        ? `Delivery ${input.stepKey} accepted by provider; awaiting status callback`
        : `Delivery sent for ${input.stepKey}`,
      metadata: {
        stepKey: input.stepKey,
        channel: input.channel,
        ...(input.result.providerMessageId
          ? { providerMessageId: input.result.providerMessageId }
          : {}),
      },
    });
  });
}

export async function sendHandler(
  ctx: NodeExecutionContext,
): Promise<NodeHandlerResult> {
  const channel = resolveChannel(ctx.actionType);
  const scheduledFor = new Date(ctx.cursor);
  const deterministicKey = `${ctx.identity.journeyRunId}:${ctx.stepKey}`;

  const journeyDeliveryId = await ctx.runtime.runStep(
    `send-prepare:${ctx.stepKey}`,
    () =>
      prepareSend({
        orgId: ctx.identity.orgId,
        runId: ctx.identity.journeyRunId,
        stepKey: ctx.stepKey,
        actionType: ctx.actionType,
        channel,
        scheduledFor,
        deterministicKey,
      }),
  );
  const sendResult = await ctx.runtime.runStep(`send:${ctx.stepKey}`, () =>
    dispatchSendOnly({
      orgId: ctx.identity.orgId,
      runId: ctx.identity.journeyRunId,
      stepKey: ctx.stepKey,
      actionType: ctx.actionType,
      channel,
      journeyDeliveryId,
      deterministicKey,
      stepConfig: getActionConfig(ctx.node),
      mode: ctx.identity.mode,
      triggerEntityType: ctx.identity.triggerEntityType,
      appointmentId: ctx.identity.appointmentId,
      clientId: ctx.identity.clientId,
      dispatchDelivery: ctx.deps.dispatchDelivery,
      maxDispatchAttempts: ctx.deps.maxDispatchAttempts,
    }),
  );
  await ctx.runtime.runStep(`send-finalize:${ctx.stepKey}`, () =>
    finalizeSend({
      orgId: ctx.identity.orgId,
      runId: ctx.identity.journeyRunId,
      stepKey: ctx.stepKey,
      actionType: ctx.actionType,
      channel,
      deterministicKey,
      scheduledFor,
      result: sendResult,
    }),
  );

  return {
    kind: "advance",
    nextNodeIds: ctx.nav.successors(),
    cursor: ctx.cursor,
    context: ctx.nodeContext,
  };
}
