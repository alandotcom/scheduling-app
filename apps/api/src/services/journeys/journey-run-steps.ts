import { type JourneyRunMode } from "@scheduling/dto";
import { journeyDeliveries, journeyRuns } from "@scheduling/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { retry } from "es-toolkit/function";
import { withOrg } from "../../lib/db.js";
import {
  JourneyDeliveryNonRetryableError,
  type JourneyDeliveryDispatcher,
  type JourneyDeliveryDispatchInput,
} from "./delivery-dispatch-helpers.js";
import { getProviderForActionType } from "./delivery-provider-registry.js";
import {
  buildOutgoingEdgesBySource,
  getActionConfig,
  getConditionExpression,
  resolveAppointmentRequiresConfirmation,
  resolveAppointmentStatus,
  resolveConditionNextNodeIdForContext,
  resolveWaitCursor,
  resolveWaitForConfirmationTimeoutAt,
  type ActionNode,
} from "./journey-graph-walk.js";
import {
  appendJourneyRunEvent,
  upsertJourneyRunStepLog,
} from "./journey-run-artifacts.js";

// Per-node DB-writing step helpers for the journey-run executor. Each opens a
// `withOrg` transaction and writes the projection the overlay reads (run status,
// step logs, run events, delivery rows). The executor (journey-run-executor.ts)
// calls these from inside memoized durable steps; isolating them here keeps the
// executor focused on the graph walk and the durable-primitive contract.

export const ACTIVE_RUN_STATUSES = ["planned", "running"] as const;

// The trigger context loaded once per run (and reloaded after durable waits),
// shared between the executor's walk and the step helpers that read it.
export type PlannerContext = {
  appointmentContext: Record<string, unknown>;
  clientContext: Record<string, unknown>;
  orgTimezone: string;
};

type LoadedRun = {
  status: "planned" | "running" | "completed" | "canceled" | "failed";
  journeyVersionSnapshot: unknown;
  journeyNameSnapshot: string;
};

export async function loadRunForExecution(
  orgId: string,
  runId: string,
): Promise<LoadedRun | null> {
  return withOrg(orgId, async (tx) => {
    const [run] = await tx
      .select({
        status: journeyRuns.status,
        journeyVersionSnapshot: journeyRuns.journeyVersionSnapshot,
        journeyNameSnapshot: journeyRuns.journeyNameSnapshot,
      })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, runId))
      .limit(1);

    return run ?? null;
  });
}

export async function startRunExecution(input: {
  orgId: string;
  runId: string;
  triggerStepKey: string;
  triggerEventType: string;
  startedAt: Date;
  appointmentId: string | null;
}): Promise<void> {
  await withOrg(input.orgId, async (tx) => {
    await tx
      .update(journeyRuns)
      .set({ status: "running" })
      .where(
        and(
          eq(journeyRuns.id, input.runId),
          inArray(journeyRuns.status, [...ACTIVE_RUN_STATUSES]),
        ),
      );

    await upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.triggerStepKey,
      nodeType: "trigger",
      status: "success",
      startedAt: input.startedAt,
      completedAt: input.startedAt,
      durationMs: 0,
      logInput: {
        eventType: input.triggerEventType,
        appointmentId: input.appointmentId,
      },
      logOutput: { routed: true },
    });

    await appendJourneyRunEvent({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      eventType: "run_started",
      message: "Run started",
    });
  });
}

export async function enterWaitStep(input: {
  orgId: string;
  runId: string;
  node: ActionNode;
  stepKey: string;
  label: string;
  cursor: Date;
  context: PlannerContext;
}): Promise<string> {
  const config = getActionConfig(input.node);
  const waitUntil = resolveWaitCursor({
    node: input.node,
    cursor: input.cursor,
    appointmentContext: input.context.appointmentContext,
    clientContext: input.context.clientContext,
    orgTimezone: input.context.orgTimezone,
  });

  await withOrg(input.orgId, async (tx) => {
    await upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.stepKey,
      nodeType: "wait",
      status: "running",
      startedAt: input.cursor,
      completedAt: null,
      durationMs: null,
      logInput: {
        waitDuration: config["waitDuration"] ?? null,
        waitUntil: config["waitUntil"] ?? null,
        waitOffset: config["waitOffset"] ?? null,
        waitTimezone: config["waitTimezone"] ?? null,
        waitAllowedHoursMode: config["waitAllowedHoursMode"] ?? null,
        waitAllowedStartTime: config["waitAllowedStartTime"] ?? null,
        waitAllowedEndTime: config["waitAllowedEndTime"] ?? null,
        cursor: input.cursor.toISOString(),
      },
      logOutput: { waitUntil: waitUntil.toISOString() },
    });
    await appendJourneyRunEvent({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      eventType: "run_waiting",
      message: `Run waiting in delay node '${input.label || "Wait"}'`,
      metadata: { stepKey: input.stepKey, waitUntil: waitUntil.toISOString() },
    });
  });

  return waitUntil.toISOString();
}

export async function exitWaitStep(input: {
  orgId: string;
  runId: string;
  stepKey: string;
  startedAt: Date;
  completedAt: Date;
}): Promise<void> {
  await withOrg(input.orgId, (tx) =>
    upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.stepKey,
      nodeType: "wait",
      status: "success",
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: Math.max(
        0,
        input.completedAt.getTime() - input.startedAt.getTime(),
      ),
      logOutput: { waitUntil: input.completedAt.toISOString() },
    }),
  );
}

export async function evaluateConditionStep(input: {
  orgId: string;
  runId: string;
  node: ActionNode;
  stepKey: string;
  journeyId: string;
  triggerEntityId: string;
  outgoingEdgesBySource: ReturnType<typeof buildOutgoingEdgesBySource>;
  context: PlannerContext;
  now: Date;
  startedAt: Date;
}): Promise<{ nextNodeIds: string[] }> {
  const result = resolveConditionNextNodeIdForContext({
    node: input.node,
    outgoingEdgesBySource: input.outgoingEdgesBySource,
    appointmentContext: input.context.appointmentContext,
    clientContext: input.context.clientContext,
    journeyId: input.journeyId,
    triggerEntityId: input.triggerEntityId,
    now: input.now,
    orgTimezone: input.context.orgTimezone,
  });

  await withOrg(input.orgId, (tx) =>
    upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.stepKey,
      nodeType: "condition",
      status: result.error ? "error" : "success",
      startedAt: input.startedAt,
      completedAt: input.startedAt,
      durationMs: 0,
      logInput: { expression: getConditionExpression(input.node) },
      logOutput: { matched: result.matched, nextNodeIds: result.nextNodeIds },
      error: result.error?.message ?? null,
    }),
  );

  return { nextNodeIds: result.nextNodeIds };
}

export async function enterWaitForConfirmationStep(input: {
  orgId: string;
  runId: string;
  stepKey: string;
  label: string;
  graceMinutes: number;
  cursor: Date;
  context: PlannerContext;
}): Promise<{ waiting: false } | { waiting: true; timeoutAt: string }> {
  const requiresConfirmation = resolveAppointmentRequiresConfirmation(
    input.context.appointmentContext,
  );
  const appointmentStatus = resolveAppointmentStatus(
    input.context.appointmentContext,
  );
  const alreadyConfirmed = appointmentStatus === "confirmed";

  if (!requiresConfirmation || alreadyConfirmed) {
    await withOrg(input.orgId, (tx) =>
      upsertJourneyRunStepLog({
        tx,
        orgId: input.orgId,
        runId: input.runId,
        stepKey: input.stepKey,
        nodeType: "wait-for-confirmation",
        status: "success",
        startedAt: input.cursor,
        completedAt: input.cursor,
        durationMs: 0,
        logInput: {
          requiresConfirmation,
          appointmentStatus,
          confirmationGraceMinutes: input.graceMinutes,
        },
        logOutput: {
          continued: true,
          reasonCode: !requiresConfirmation
            ? "confirmation_not_required"
            : "already_confirmed",
        },
      }),
    );
    return { waiting: false };
  }

  const timeoutAt = resolveWaitForConfirmationTimeoutAt({
    appointmentContext: input.context.appointmentContext,
    fallback: input.cursor,
    graceMinutes: input.graceMinutes,
  });

  await withOrg(input.orgId, async (tx) => {
    await upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.stepKey,
      nodeType: "wait-for-confirmation",
      status: "running",
      startedAt: input.cursor,
      completedAt: null,
      durationMs: null,
      logInput: {
        requiresConfirmation,
        appointmentStatus,
        confirmationGraceMinutes: input.graceMinutes,
        cursor: input.cursor.toISOString(),
      },
      logOutput: { waitUntil: timeoutAt.toISOString() },
    });
    await appendJourneyRunEvent({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      eventType: "run_waiting_confirmation",
      message: `Run waiting for appointment confirmation in '${input.label || "Wait For Confirmation"}'`,
      metadata: {
        stepKey: input.stepKey,
        waitUntil: timeoutAt.toISOString(),
        confirmationGraceMinutes: input.graceMinutes,
      },
    });
  });

  return { waiting: true, timeoutAt: timeoutAt.toISOString() };
}

export async function exitWaitForConfirmationStep(input: {
  orgId: string;
  runId: string;
  stepKey: string;
  startedAt: Date;
  completedAt: Date;
  confirmed: boolean;
}): Promise<void> {
  await withOrg(input.orgId, async (tx) => {
    await upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.stepKey,
      nodeType: "wait-for-confirmation",
      status: "success",
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: Math.max(
        0,
        input.completedAt.getTime() - input.startedAt.getTime(),
      ),
      logOutput: {
        confirmed: input.confirmed,
        reasonCode: input.confirmed ? "appointment_confirmed" : "timeout",
      },
    });
    await appendJourneyRunEvent({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      eventType: input.confirmed
        ? "run_confirmation_received"
        : "run_confirmation_timeout",
      message: input.confirmed
        ? "Appointment confirmed; run resuming"
        : "Confirmation window elapsed",
      metadata: { stepKey: input.stepKey },
    });
  });
}

type SendResult = {
  providerMessageId: string | null;
  reasonCode: string | null;
  awaitingAsyncCallback: boolean;
  attempts: number;
};

// Step 1: record the delivery in `planned` before the send. Insert-or-get so the
// returned id is stable across replays (it is the row's id, the same value the
// provider receives as its callback correlation handle). Also writes a `running`
// step log so the overlay shows the send in progress.
export async function prepareSendStep(input: {
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

// Step 2: the only non-idempotent effect — dispatch the provider send. Runs in
// its own memoized step, so a successful send is checkpointed and never replays
// when a later step (finalize) fails and Inngest retries the function.
export async function dispatchSendOnly(input: {
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

// Step 3: finalize the projection from the memoized send result. Async-callback
// providers (Twilio) leave the row `planned`; the journey-action callback
// function finalizes it by id later. The walk advances regardless.
export async function finalizeSendStep(input: {
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

export async function finalizeRun(input: {
  orgId: string;
  runId: string;
  status: "completed" | "canceled" | "failed";
  eventType: string;
  message: string;
}): Promise<void> {
  await withOrg(input.orgId, async (tx) => {
    await tx
      .update(journeyRuns)
      .set({
        status: input.status,
        ...(input.status === "completed"
          ? { completedAt: sql`now()` }
          : { cancelledAt: sql`now()` }),
      })
      .where(
        and(
          eq(journeyRuns.id, input.runId),
          inArray(journeyRuns.status, [...ACTIVE_RUN_STATUSES]),
        ),
      );

    await appendJourneyRunEvent({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      eventType: input.eventType,
      message: input.message,
    });
  });
}

// Called from the Inngest function's onFailure (retries exhausted) so a run whose
// walk threw past its retries is recorded `failed` in the projection the overlay
// reads, rather than left stuck `running`. Guarded to active runs, so it never
// overrides a run already completed/canceled.
export async function markJourneyRunFailed(
  orgId: string,
  runId: string,
): Promise<void> {
  await finalizeRun({
    orgId,
    runId,
    status: "failed",
    eventType: "run_failed",
    message: "Run failed after exhausting retries",
  });
}
