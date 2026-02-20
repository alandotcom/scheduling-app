import { linearJourneyGraphSchema } from "@scheduling/dto";
import { journeyDeliveries, journeyRuns } from "@scheduling/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { retry } from "es-toolkit/function";
import type { JourneyDeliveryScheduledEventData } from "../inngest/runtime-events.js";
import { withOrg } from "../lib/db.js";
import { toRecord } from "../lib/type-guards.js";
import { dispatchForActionType } from "./delivery-provider-registry.js";
import {
  JourneyDeliveryNonRetryableError,
  type JourneyDeliveryDispatchInput,
  type JourneyDeliveryDispatcher,
} from "./delivery-dispatch-helpers.js";
import {
  appendJourneyRunEvent,
  upsertJourneyRunStepLog,
} from "./journey-run-artifacts.js";
import { executeWaitResume } from "./journey-planner.js";
import { refreshJourneyRunStatus } from "./journey-run-status.js";

const DEFAULT_MAX_DISPATCH_ATTEMPTS = 2;

type DeliveryStatus = typeof journeyDeliveries.$inferSelect.status;
type TerminalDeliveryStatus = Extract<
  DeliveryStatus,
  "sent" | "failed" | "canceled" | "skipped"
>;

type DeliveryRow = Pick<
  typeof journeyDeliveries.$inferSelect,
  | "id"
  | "journeyRunId"
  | "status"
  | "reasonCode"
  | "channel"
  | "actionType"
  | "stepKey"
  | "deterministicKey"
  | "scheduledFor"
>;

type RunRow = Pick<
  typeof journeyRuns.$inferSelect,
  | "id"
  | "status"
  | "mode"
  | "triggerEntityType"
  | "appointmentId"
  | "clientId"
  | "journeyVersionSnapshot"
>;

type DeliveryWithRun = {
  delivery: DeliveryRow;
  run: RunRow | null;
};

export type JourneyDeliveryWorkerRuntime = {
  runStep: <T>(stepId: string, fn: () => Promise<T>) => Promise<T>;
  sleep: (stepId: string, delayMs: number) => Promise<void>;
};

export type JourneyDeliveryWorkerDependencies = {
  runtime?: JourneyDeliveryWorkerRuntime;
  dispatchDelivery?: JourneyDeliveryDispatcher;
  now?: () => Date;
  maxDispatchAttempts?: number;
};

export type JourneyDeliveryWorkerResult = {
  journeyDeliveryId: string;
  journeyRunId: string;
  status: TerminalDeliveryStatus;
  attempts: number;
  reasonCode?: string | null;
  providerMessageId?: string;
};

function toTerminalStatus(value: DeliveryStatus): TerminalDeliveryStatus {
  if (value === "planned") {
    return "canceled";
  }

  return value;
}

function toStepLogStatus(
  value: DeliveryStatus | TerminalDeliveryStatus,
): "pending" | "running" | "success" | "error" | "cancelled" {
  if (value === "planned") {
    return "pending";
  }

  if (value === "failed") {
    return "error";
  }

  if (value === "sent") {
    return "success";
  }

  return "cancelled";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "unknown_provider_error";
}

function toProviderErrorReasonCode(error: unknown): string {
  return `provider_error:${toErrorMessage(error)}`;
}

function parseScheduledFor(input: {
  scheduledFor: string;
  fallback: Date;
}): Date {
  const parsed = new Date(input.scheduledFor);
  return Number.isNaN(parsed.getTime()) ? input.fallback : parsed;
}

function resolveStepConfig(
  run: RunRow,
  stepKey: string,
): Record<string, unknown> {
  const snapshotRecord = toRecord(run.journeyVersionSnapshot);
  const definitionSnapshot = snapshotRecord["definitionSnapshot"];
  const parsedGraph = linearJourneyGraphSchema.safeParse(definitionSnapshot);

  if (!parsedGraph.success) {
    return {};
  }

  const node = parsedGraph.data.nodes.find(
    (candidate) => candidate.attributes.id === stepKey,
  );

  return node ? toRecord(node.attributes.data.config) : {};
}

async function loadDeliveryWithRun(
  orgId: string,
  journeyDeliveryId: string,
): Promise<DeliveryWithRun | null> {
  return withOrg(orgId, async (tx) => {
    const [delivery] = await tx
      .select({
        id: journeyDeliveries.id,
        journeyRunId: journeyDeliveries.journeyRunId,
        status: journeyDeliveries.status,
        reasonCode: journeyDeliveries.reasonCode,
        channel: journeyDeliveries.channel,
        actionType: journeyDeliveries.actionType,
        stepKey: journeyDeliveries.stepKey,
        deterministicKey: journeyDeliveries.deterministicKey,
        scheduledFor: journeyDeliveries.scheduledFor,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.id, journeyDeliveryId))
      .limit(1);

    if (!delivery) {
      return null;
    }

    const [run] = await tx
      .select({
        id: journeyRuns.id,
        status: journeyRuns.status,
        mode: journeyRuns.mode,
        triggerEntityType: journeyRuns.triggerEntityType,
        appointmentId: journeyRuns.appointmentId,
        clientId: journeyRuns.clientId,
        journeyVersionSnapshot: journeyRuns.journeyVersionSnapshot,
      })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, delivery.journeyRunId))
      .limit(1);

    return {
      delivery,
      run: run ?? null,
    };
  });
}

async function markRunRunning(orgId: string, runId: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx
      .update(journeyRuns)
      .set({
        status: "running",
        cancelledAt: null,
      })
      .where(and(eq(journeyRuns.id, runId), eq(journeyRuns.status, "planned")));
  });
}

async function updateDeliveryIfPlanned(input: {
  orgId: string;
  journeyDeliveryId: string;
  status: Extract<DeliveryStatus, "sent" | "failed" | "canceled">;
  reasonCode: string | null;
}): Promise<DeliveryRow | null> {
  return withOrg(input.orgId, async (tx) => {
    const [updated] = await tx
      .update(journeyDeliveries)
      .set({
        status: input.status,
        reasonCode: input.reasonCode,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(journeyDeliveries.id, input.journeyDeliveryId),
          eq(journeyDeliveries.status, "planned"),
        ),
      )
      .returning({
        id: journeyDeliveries.id,
        journeyRunId: journeyDeliveries.journeyRunId,
        status: journeyDeliveries.status,
        reasonCode: journeyDeliveries.reasonCode,
        channel: journeyDeliveries.channel,
        actionType: journeyDeliveries.actionType,
        stepKey: journeyDeliveries.stepKey,
        deterministicKey: journeyDeliveries.deterministicKey,
        scheduledFor: journeyDeliveries.scheduledFor,
      });

    if (updated) {
      return updated;
    }

    const [current] = await tx
      .select({
        id: journeyDeliveries.id,
        journeyRunId: journeyDeliveries.journeyRunId,
        status: journeyDeliveries.status,
        reasonCode: journeyDeliveries.reasonCode,
        channel: journeyDeliveries.channel,
        actionType: journeyDeliveries.actionType,
        stepKey: journeyDeliveries.stepKey,
        deterministicKey: journeyDeliveries.deterministicKey,
        scheduledFor: journeyDeliveries.scheduledFor,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.id, input.journeyDeliveryId))
      .limit(1);

    return current ?? null;
  });
}

async function finalizeDeliveryOutcome(input: {
  orgId: string;
  delivery: DeliveryRow;
  nodeType: string;
  dispatchStartedAt: Date;
  now: () => Date;
  status: "sent" | "failed";
  reasonCode: string | null;
  attempts: number;
  providerMessageId?: string;
  logInput?: Record<string, unknown>;
}): Promise<JourneyDeliveryWorkerResult> {
  const resolved = await updateDeliveryIfPlanned({
    orgId: input.orgId,
    journeyDeliveryId: input.delivery.id,
    status: input.status,
    reasonCode: input.reasonCode,
  });

  await refreshJourneyRunStatus(input.orgId, input.delivery.journeyRunId);

  const terminalStatus = toTerminalStatus(resolved?.status ?? input.status);
  const reasonCode = resolved?.reasonCode ?? input.reasonCode;
  const result: JourneyDeliveryWorkerResult = {
    journeyDeliveryId: input.delivery.id,
    journeyRunId: input.delivery.journeyRunId,
    status: terminalStatus,
    attempts: input.attempts,
    reasonCode,
  };

  if (input.providerMessageId) {
    result.providerMessageId = input.providerMessageId;
  }

  const completedAt = input.now();
  const isFailed = terminalStatus === "failed";
  await withOrg(input.orgId, (tx) =>
    upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.delivery.journeyRunId,
      stepKey: input.delivery.stepKey,
      nodeType: input.nodeType,
      status: toStepLogStatus(terminalStatus),
      startedAt: input.dispatchStartedAt,
      completedAt,
      durationMs: Math.max(
        0,
        completedAt.getTime() - input.dispatchStartedAt.getTime(),
      ),
      ...(input.logInput ? { logInput: input.logInput } : {}),
      logOutput: {
        status: terminalStatus,
        attempts: input.attempts,
        reasonCode: reasonCode ?? null,
        providerMessageId: result.providerMessageId ?? null,
      },
      error: isFailed ? (reasonCode ?? "provider_error") : null,
    }),
  );
  await withOrg(input.orgId, (tx) =>
    appendJourneyRunEvent({
      tx,
      orgId: input.orgId,
      runId: input.delivery.journeyRunId,
      eventType: isFailed ? "delivery_failed" : "delivery_sent",
      message: `Delivery ${input.delivery.stepKey} ${isFailed ? "failed" : "sent"}`,
      metadata: {
        stepKey: input.delivery.stepKey,
        reasonCode: isFailed ? (reasonCode ?? null) : null,
        attempts: input.attempts,
        providerMessageId: result.providerMessageId ?? null,
      },
    }),
  );

  return result;
}

async function resolveDeliveryCancellation(input: {
  orgId: string;
  delivery: DeliveryRow;
  run: RunRow | null;
  expectedDeterministicKey: string;
  nodeType: string;
  dispatchStartedAt: Date;
}): Promise<
  { proceed: true } | { proceed: false; result: JourneyDeliveryWorkerResult }
> {
  const { orgId, delivery, run, nodeType, dispatchStartedAt } = input;
  const durationMs = Math.max(
    0,
    dispatchStartedAt.getTime() - delivery.scheduledFor.getTime(),
  );

  // Check 1: delivery already terminal
  if (delivery.status !== "planned") {
    const terminalStatus = toTerminalStatus(delivery.status);
    await withOrg(orgId, (tx) =>
      upsertJourneyRunStepLog({
        tx,
        orgId,
        runId: delivery.journeyRunId,
        stepKey: delivery.stepKey,
        nodeType,
        status: toStepLogStatus(terminalStatus),
        startedAt: delivery.scheduledFor,
        completedAt: dispatchStartedAt,
        durationMs,
        logOutput: {
          status: terminalStatus,
          reasonCode: delivery.reasonCode ?? null,
        },
      }),
    );

    return {
      proceed: false,
      result: {
        journeyDeliveryId: delivery.id,
        journeyRunId: delivery.journeyRunId,
        status: terminalStatus,
        attempts: 0,
        reasonCode: delivery.reasonCode,
      },
    };
  }

  // Check 2: stale deterministic key
  // Check 3: run not active
  const shouldCancel =
    delivery.deterministicKey !== input.expectedDeterministicKey ||
    !run ||
    (run.status !== "planned" && run.status !== "running");

  if (!shouldCancel) {
    return { proceed: true };
  }

  const resolved = await updateDeliveryIfPlanned({
    orgId,
    journeyDeliveryId: delivery.id,
    status: "canceled",
    reasonCode: "execution_terminal",
  });

  await refreshJourneyRunStatus(orgId, delivery.journeyRunId);
  const terminalStatus = toTerminalStatus(resolved?.status ?? "canceled");
  const reasonCode = resolved?.reasonCode ?? "execution_terminal";

  await withOrg(orgId, (tx) =>
    upsertJourneyRunStepLog({
      tx,
      orgId,
      runId: delivery.journeyRunId,
      stepKey: delivery.stepKey,
      nodeType,
      status: toStepLogStatus(terminalStatus),
      startedAt: delivery.scheduledFor,
      completedAt: dispatchStartedAt,
      durationMs,
      logOutput: {
        status: terminalStatus,
        reasonCode,
      },
    }),
  );
  await withOrg(orgId, (tx) =>
    appendJourneyRunEvent({
      tx,
      orgId,
      runId: delivery.journeyRunId,
      eventType: "delivery_canceled",
      message: `Delivery ${delivery.stepKey} canceled`,
      metadata: { reasonCode },
    }),
  );

  return {
    proceed: false,
    result: {
      journeyDeliveryId: delivery.id,
      journeyRunId: delivery.journeyRunId,
      status: terminalStatus,
      attempts: 0,
      reasonCode,
    },
  };
}

const defaultRuntime: JourneyDeliveryWorkerRuntime = {
  runStep: async (_stepId, fn) => fn(),
  sleep: async (_stepId, delayMs) => {
    if (delayMs <= 0) {
      return;
    }

    await Bun.sleep(Math.ceil(delayMs));
  },
};

export async function executeJourneyDeliveryScheduled(
  input: JourneyDeliveryScheduledEventData,
  dependencies: JourneyDeliveryWorkerDependencies = {},
): Promise<JourneyDeliveryWorkerResult> {
  const runtime = dependencies.runtime ?? defaultRuntime;
  const dispatchDelivery =
    dependencies.dispatchDelivery ?? dispatchForActionType;
  const now = dependencies.now ?? (() => new Date());
  const maxDispatchAttempts = Math.max(
    1,
    dependencies.maxDispatchAttempts ?? DEFAULT_MAX_DISPATCH_ATTEMPTS,
  );

  const loadedDelivery = await runtime.runStep("load-delivery", async () =>
    loadDeliveryWithRun(input.orgId, input.journeyDeliveryId),
  );

  if (!loadedDelivery) {
    return {
      journeyDeliveryId: input.journeyDeliveryId,
      journeyRunId: input.journeyRunId,
      status: "canceled",
      attempts: 0,
      reasonCode: "delivery_missing",
    };
  }

  const scheduledFor = parseScheduledFor({
    scheduledFor: input.scheduledFor,
    fallback: loadedDelivery.delivery.scheduledFor,
  });

  const initialDelayMs = scheduledFor.getTime() - now().getTime();
  if (initialDelayMs > 0) {
    await runtime.sleep("wait-until-due", Math.ceil(initialDelayMs));
  }

  return runtime.runStep("dispatch-delivery", async () => {
    const current = await loadDeliveryWithRun(
      input.orgId,
      input.journeyDeliveryId,
    );
    if (!current) {
      return {
        journeyDeliveryId: input.journeyDeliveryId,
        journeyRunId: input.journeyRunId,
        status: "canceled" as const,
        attempts: 0,
        reasonCode: "delivery_missing",
      };
    }

    const run = current.run;
    const stepConfig = run
      ? resolveStepConfig(run, current.delivery.stepKey)
      : {};
    const nodeType = current.delivery.actionType;
    const dispatchStartedAt = now();

    const cancellation = await resolveDeliveryCancellation({
      orgId: input.orgId,
      delivery: current.delivery,
      run,
      expectedDeterministicKey: input.deterministicKey,
      nodeType,
      dispatchStartedAt,
    });
    if (!cancellation.proceed) {
      return cancellation.result;
    }

    // After cancellation check, run is guaranteed non-null and active.
    if (!run) {
      throw new Error("Unexpected: run is null after cancellation check.");
    }

    // Intercept wait-resume: re-plan from this wait node with fresh data
    if (current.delivery.actionType === "wait-resume") {
      await executeWaitResume({
        orgId: input.orgId,
        journeyRunId: current.delivery.journeyRunId,
        journeyDeliveryId: current.delivery.id,
        stepKey: current.delivery.stepKey,
      });

      return finalizeDeliveryOutcome({
        orgId: input.orgId,
        delivery: current.delivery,
        nodeType: "wait-resume",
        dispatchStartedAt,
        now,
        status: "sent",
        reasonCode: null,
        attempts: 1,
        logInput: {
          stepKey: current.delivery.stepKey,
          journeyRunId: current.delivery.journeyRunId,
        },
      });
    }

    await markRunRunning(input.orgId, current.delivery.journeyRunId);

    const dispatchPayload: JourneyDeliveryDispatchInput = {
      orgId: input.orgId,
      journeyDeliveryId: current.delivery.id,
      journeyRunId: current.delivery.journeyRunId,
      channel: current.delivery.channel,
      idempotencyKey: current.delivery.deterministicKey,
      runMode: run.mode,
      stepConfig,
      triggerEntityType: run.triggerEntityType,
      ...(run.appointmentId != null
        ? { appointmentId: run.appointmentId }
        : {}),
      ...(run.clientId != null ? { clientId: run.clientId } : {}),
    };
    const dispatchLogInput = {
      orgId: dispatchPayload.orgId,
      journeyDeliveryId: dispatchPayload.journeyDeliveryId,
      journeyRunId: dispatchPayload.journeyRunId,
      channel: dispatchPayload.channel,
      idempotencyKey: dispatchPayload.idempotencyKey,
      runMode: dispatchPayload.runMode,
      stepConfig: dispatchPayload.stepConfig,
    };
    await withOrg(input.orgId, (tx) =>
      upsertJourneyRunStepLog({
        tx,
        orgId: input.orgId,
        runId: current.delivery.journeyRunId,
        stepKey: current.delivery.stepKey,
        nodeType,
        status: "running",
        startedAt: dispatchStartedAt,
        logInput: dispatchLogInput,
        logOutput: {
          scheduledFor: current.delivery.scheduledFor.toISOString(),
        },
      }),
    );
    await withOrg(input.orgId, (tx) =>
      appendJourneyRunEvent({
        tx,
        orgId: input.orgId,
        runId: current.delivery.journeyRunId,
        eventType: "delivery_dispatch_started",
        message: `Dispatch started for ${current.delivery.stepKey}`,
        metadata: {
          stepKey: current.delivery.stepKey,
          channel: current.delivery.channel,
        },
      }),
    );

    let attempts = 0;
    try {
      const dispatched = await retry(
        async () => {
          attempts++;
          return dispatchDelivery(dispatchPayload);
        },
        {
          retries: maxDispatchAttempts,
          shouldRetry: (error) =>
            !(error instanceof JourneyDeliveryNonRetryableError),
        },
      );

      const providerMessageId =
        typeof dispatched.providerMessageId === "string"
          ? dispatched.providerMessageId
          : undefined;

      if (dispatched.awaitingAsyncCallback) {
        await withOrg(input.orgId, (tx) =>
          upsertJourneyRunStepLog({
            tx,
            orgId: input.orgId,
            runId: current.delivery.journeyRunId,
            stepKey: current.delivery.stepKey,
            nodeType,
            status: "running",
            startedAt: dispatchStartedAt,
            logInput: dispatchLogInput,
            logOutput: {
              status: "planned",
              attempts,
              reasonCode: dispatched.reasonCode ?? null,
              providerMessageId: providerMessageId ?? null,
              providerState: "accepted_pending_callback",
            },
          }),
        );
        await withOrg(input.orgId, (tx) =>
          appendJourneyRunEvent({
            tx,
            orgId: input.orgId,
            runId: current.delivery.journeyRunId,
            eventType: "delivery_provider_accepted",
            message: `Delivery ${current.delivery.stepKey} accepted by provider; waiting for status callback`,
            metadata: {
              stepKey: current.delivery.stepKey,
              attempts,
              ...(providerMessageId ? { providerMessageId } : {}),
            },
          }),
        );

        return {
          journeyDeliveryId: current.delivery.id,
          journeyRunId: current.delivery.journeyRunId,
          status: "sent",
          attempts,
          reasonCode: dispatched.reasonCode ?? null,
          ...(providerMessageId ? { providerMessageId } : {}),
        };
      }

      return finalizeDeliveryOutcome({
        orgId: input.orgId,
        delivery: current.delivery,
        nodeType,
        dispatchStartedAt,
        now,
        status: "sent",
        reasonCode: dispatched.reasonCode ?? null,
        attempts,
        ...(providerMessageId ? { providerMessageId } : {}),
        logInput: dispatchLogInput,
      });
    } catch (error) {
      return finalizeDeliveryOutcome({
        orgId: input.orgId,
        delivery: current.delivery,
        nodeType,
        dispatchStartedAt,
        now,
        status: "failed",
        reasonCode: toProviderErrorReasonCode(error),
        attempts,
        logInput: dispatchLogInput,
      });
    }
  });
}
