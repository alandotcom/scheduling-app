import { linearJourneyGraphSchema } from "@scheduling/dto";
import { journeyDeliveries, journeyRuns } from "@scheduling/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { JourneyDeliveryScheduledEventData } from "../inngest/runtime-events.js";
import { withOrg } from "../lib/db.js";
import {
  dispatchJourneyDelivery,
  type JourneyDeliveryDispatcher,
} from "./journey-delivery-adapters.js";
import {
  appendJourneyRunEvent,
  upsertJourneyRunStepLog,
} from "./journey-run-artifacts.js";

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
  | "stepKey"
  | "deterministicKey"
  | "scheduledFor"
>;

type RunRow = Pick<
  typeof journeyRuns.$inferSelect,
  "id" | "status" | "mode" | "journeyVersionSnapshot"
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

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

function resolveStepNodeType(
  stepConfig: Record<string, unknown>,
  delivery: DeliveryRow,
): string {
  const actionType =
    typeof stepConfig["actionType"] === "string"
      ? stepConfig["actionType"].trim().toLowerCase()
      : "";
  if (actionType.length > 0) {
    return actionType;
  }

  return delivery.channel;
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

async function refreshRunStatus(orgId: string, runId: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    const [run] = await tx
      .select({ id: journeyRuns.id, status: journeyRuns.status })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, runId))
      .limit(1);

    if (!run) {
      return;
    }

    if (
      run.status === "failed" ||
      run.status === "canceled" ||
      run.status === "completed"
    ) {
      return;
    }

    const statuses = await tx
      .select({ status: journeyDeliveries.status })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runId));

    if (statuses.length === 0) {
      return;
    }

    const values = statuses.map((item) => item.status);

    if (values.includes("failed")) {
      await tx
        .update(journeyRuns)
        .set({
          status: "failed",
          completedAt: sql`now()`,
          cancelledAt: null,
        })
        .where(eq(journeyRuns.id, runId));
      return;
    }

    if (values.includes("planned")) {
      const hasTerminal = values.some((value) => value !== "planned");

      await tx
        .update(journeyRuns)
        .set({
          status: hasTerminal ? "running" : "planned",
          completedAt: null,
          cancelledAt: null,
        })
        .where(eq(journeyRuns.id, runId));
      return;
    }

    if (values.every((value) => value === "canceled")) {
      await tx
        .update(journeyRuns)
        .set({
          status: "canceled",
          cancelledAt: sql`now()`,
        })
        .where(eq(journeyRuns.id, runId));
      return;
    }

    await tx
      .update(journeyRuns)
      .set({
        status: "completed",
        completedAt: sql`now()`,
        cancelledAt: null,
      })
      .where(eq(journeyRuns.id, runId));
  });
}

async function appendRunEvent(input: {
  orgId: string;
  runId: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await withOrg(input.orgId, async (tx) => {
    await appendJourneyRunEvent({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      eventType: input.eventType,
      message: input.message,
      metadata: input.metadata,
    });
  });
}

async function upsertRunStepLog(input: {
  orgId: string;
  runId: string;
  stepKey: string;
  nodeType: string;
  status: "pending" | "running" | "success" | "error" | "cancelled";
  startedAt: Date;
  completedAt?: Date | null;
  durationMs?: number | null;
  logInput?: Record<string, unknown>;
  logOutput?: Record<string, unknown>;
  error?: string | null;
}): Promise<void> {
  await withOrg(input.orgId, async (tx) => {
    await upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.stepKey,
      nodeType: input.nodeType,
      status: input.status,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: input.durationMs,
      logInput: input.logInput,
      logOutput: input.logOutput,
      error: input.error,
    });
  });
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
    dependencies.dispatchDelivery ?? dispatchJourneyDelivery;
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
    const nodeType = resolveStepNodeType(stepConfig, current.delivery);
    const dispatchStartedAt = now();

    if (current.delivery.status !== "planned") {
      const terminalStatus = toTerminalStatus(current.delivery.status);
      await upsertRunStepLog({
        orgId: input.orgId,
        runId: current.delivery.journeyRunId,
        stepKey: current.delivery.stepKey,
        nodeType,
        status: toStepLogStatus(terminalStatus),
        startedAt: current.delivery.scheduledFor,
        completedAt: dispatchStartedAt,
        durationMs: Math.max(
          0,
          dispatchStartedAt.getTime() - current.delivery.scheduledFor.getTime(),
        ),
        logOutput: {
          status: terminalStatus,
          reasonCode: current.delivery.reasonCode ?? null,
        },
      });

      return {
        journeyDeliveryId: current.delivery.id,
        journeyRunId: current.delivery.journeyRunId,
        status: terminalStatus,
        attempts: 0,
        reasonCode: current.delivery.reasonCode,
      };
    }

    if (current.delivery.deterministicKey !== input.deterministicKey) {
      const resolved = await updateDeliveryIfPlanned({
        orgId: input.orgId,
        journeyDeliveryId: current.delivery.id,
        status: "canceled",
        reasonCode: "execution_terminal",
      });

      await refreshRunStatus(input.orgId, current.delivery.journeyRunId);
      const terminalStatus = toTerminalStatus(resolved?.status ?? "canceled");
      await upsertRunStepLog({
        orgId: input.orgId,
        runId: current.delivery.journeyRunId,
        stepKey: current.delivery.stepKey,
        nodeType,
        status: toStepLogStatus(terminalStatus),
        startedAt: current.delivery.scheduledFor,
        completedAt: dispatchStartedAt,
        durationMs: Math.max(
          0,
          dispatchStartedAt.getTime() - current.delivery.scheduledFor.getTime(),
        ),
        logOutput: {
          status: terminalStatus,
          reasonCode: resolved?.reasonCode ?? "execution_terminal",
        },
      });
      await appendRunEvent({
        orgId: input.orgId,
        runId: current.delivery.journeyRunId,
        eventType: "delivery_canceled",
        message: `Delivery ${current.delivery.stepKey} canceled`,
        metadata: {
          reasonCode: resolved?.reasonCode ?? "execution_terminal",
        },
      });

      return {
        journeyDeliveryId: current.delivery.id,
        journeyRunId: current.delivery.journeyRunId,
        status: terminalStatus,
        attempts: 0,
        reasonCode: resolved?.reasonCode ?? "execution_terminal",
      };
    }

    if (!run || (run.status !== "planned" && run.status !== "running")) {
      const resolved = await updateDeliveryIfPlanned({
        orgId: input.orgId,
        journeyDeliveryId: current.delivery.id,
        status: "canceled",
        reasonCode: "execution_terminal",
      });

      await refreshRunStatus(input.orgId, current.delivery.journeyRunId);
      const terminalStatus = toTerminalStatus(resolved?.status ?? "canceled");
      await upsertRunStepLog({
        orgId: input.orgId,
        runId: current.delivery.journeyRunId,
        stepKey: current.delivery.stepKey,
        nodeType,
        status: toStepLogStatus(terminalStatus),
        startedAt: current.delivery.scheduledFor,
        completedAt: dispatchStartedAt,
        durationMs: Math.max(
          0,
          dispatchStartedAt.getTime() - current.delivery.scheduledFor.getTime(),
        ),
        logOutput: {
          status: terminalStatus,
          reasonCode: resolved?.reasonCode ?? "execution_terminal",
        },
      });
      await appendRunEvent({
        orgId: input.orgId,
        runId: current.delivery.journeyRunId,
        eventType: "delivery_canceled",
        message: `Delivery ${current.delivery.stepKey} canceled`,
        metadata: {
          reasonCode: resolved?.reasonCode ?? "execution_terminal",
        },
      });

      return {
        journeyDeliveryId: current.delivery.id,
        journeyRunId: current.delivery.journeyRunId,
        status: terminalStatus,
        attempts: 0,
        reasonCode: resolved?.reasonCode ?? "execution_terminal",
      };
    }

    await markRunRunning(input.orgId, current.delivery.journeyRunId);

    const dispatchPayload = {
      orgId: input.orgId,
      journeyDeliveryId: current.delivery.id,
      journeyRunId: current.delivery.journeyRunId,
      channel: current.delivery.channel,
      idempotencyKey: current.delivery.deterministicKey,
      runMode: run.mode,
      stepConfig,
    };
    await upsertRunStepLog({
      orgId: input.orgId,
      runId: current.delivery.journeyRunId,
      stepKey: current.delivery.stepKey,
      nodeType,
      status: "running",
      startedAt: dispatchStartedAt,
      logInput: dispatchPayload,
      logOutput: {
        scheduledFor: current.delivery.scheduledFor.toISOString(),
      },
    });
    await appendRunEvent({
      orgId: input.orgId,
      runId: current.delivery.journeyRunId,
      eventType: "delivery_dispatch_started",
      message: `Dispatch started for ${current.delivery.stepKey}`,
      metadata: {
        stepKey: current.delivery.stepKey,
        channel: current.delivery.channel,
      },
    });

    const attemptDispatch = async (
      attempt: number,
    ): Promise<
      | {
          ok: true;
          attempts: number;
          dispatched: Awaited<ReturnType<JourneyDeliveryDispatcher>>;
        }
      | {
          ok: false;
          attempts: number;
          error: unknown;
        }
    > => {
      try {
        const dispatched = await dispatchDelivery(dispatchPayload);
        return {
          ok: true,
          attempts: attempt,
          dispatched,
        };
      } catch (error: unknown) {
        if (attempt >= maxDispatchAttempts) {
          return {
            ok: false,
            attempts: attempt,
            error,
          };
        }

        return attemptDispatch(attempt + 1);
      }
    };

    const dispatchAttempt = await attemptDispatch(1);

    if (dispatchAttempt.ok) {
      const dispatchedReasonCode =
        dispatchAttempt.dispatched.reasonCode ?? null;
      const resolved = await updateDeliveryIfPlanned({
        orgId: input.orgId,
        journeyDeliveryId: current.delivery.id,
        status: "sent",
        reasonCode: dispatchedReasonCode,
      });

      await refreshRunStatus(input.orgId, current.delivery.journeyRunId);

      const result: JourneyDeliveryWorkerResult = {
        journeyDeliveryId: current.delivery.id,
        journeyRunId: current.delivery.journeyRunId,
        status: toTerminalStatus(resolved?.status ?? "sent"),
        attempts: dispatchAttempt.attempts,
        reasonCode: resolved?.reasonCode ?? dispatchedReasonCode,
      };

      if (typeof dispatchAttempt.dispatched.providerMessageId === "string") {
        result.providerMessageId = dispatchAttempt.dispatched.providerMessageId;
      }

      const completedAt = now();
      await upsertRunStepLog({
        orgId: input.orgId,
        runId: current.delivery.journeyRunId,
        stepKey: current.delivery.stepKey,
        nodeType,
        status: toStepLogStatus(result.status),
        startedAt: dispatchStartedAt,
        completedAt,
        durationMs: Math.max(
          0,
          completedAt.getTime() - dispatchStartedAt.getTime(),
        ),
        logInput: dispatchPayload,
        logOutput: {
          status: result.status,
          attempts: result.attempts,
          reasonCode: result.reasonCode ?? null,
          providerMessageId: result.providerMessageId ?? null,
        },
      });
      await appendRunEvent({
        orgId: input.orgId,
        runId: current.delivery.journeyRunId,
        eventType: "delivery_sent",
        message: `Delivery ${current.delivery.stepKey} sent`,
        metadata: {
          stepKey: current.delivery.stepKey,
          attempts: result.attempts,
          providerMessageId: result.providerMessageId ?? null,
        },
      });

      return result;
    }

    const reasonCode = toProviderErrorReasonCode(dispatchAttempt.error);
    const resolved = await updateDeliveryIfPlanned({
      orgId: input.orgId,
      journeyDeliveryId: current.delivery.id,
      status: "failed",
      reasonCode,
    });

    await refreshRunStatus(input.orgId, current.delivery.journeyRunId);

    const result = {
      journeyDeliveryId: current.delivery.id,
      journeyRunId: current.delivery.journeyRunId,
      status: toTerminalStatus(resolved?.status ?? "failed"),
      attempts: dispatchAttempt.attempts,
      reasonCode: resolved?.reasonCode ?? reasonCode,
    };
    const completedAt = now();
    await upsertRunStepLog({
      orgId: input.orgId,
      runId: current.delivery.journeyRunId,
      stepKey: current.delivery.stepKey,
      nodeType,
      status: toStepLogStatus(result.status),
      startedAt: dispatchStartedAt,
      completedAt,
      durationMs: Math.max(
        0,
        completedAt.getTime() - dispatchStartedAt.getTime(),
      ),
      logInput: dispatchPayload,
      logOutput: {
        status: result.status,
        attempts: result.attempts,
      },
      error: result.reasonCode ?? "provider_error",
    });
    await appendRunEvent({
      orgId: input.orgId,
      runId: current.delivery.journeyRunId,
      eventType: "delivery_failed",
      message: `Delivery ${current.delivery.stepKey} failed`,
      metadata: {
        stepKey: current.delivery.stepKey,
        reasonCode: result.reasonCode ?? "provider_error",
        attempts: result.attempts,
      },
    });

    return result;
  });
}
