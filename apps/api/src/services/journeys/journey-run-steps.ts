import { journeyRuns } from "@scheduling/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { withOrg } from "../../lib/db.js";
import {
  appendJourneyRunEvent,
  upsertJourneyRunStepLog,
} from "./journey-run-artifacts.js";

// Run-level DB-writing helpers for the journey-run executor: load the pinned run,
// transition planned -> running (recording the trigger step), and finalize the run
// status (completed / canceled / failed). Each opens its own `withOrg` transaction
// and writes the projection the overlay reads. Per-node lifecycle lives in the node
// handlers (journey-run-handlers/); see the `node-execution` seam in CONTEXT.md.

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
