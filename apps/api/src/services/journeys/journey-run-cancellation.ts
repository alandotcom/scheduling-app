import {
  journeyDeliveries,
  journeyRuns,
  journeyVersions,
} from "@scheduling/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { type DbClient } from "../../lib/db.js";
import { sendJourneyRunCancel } from "../../inngest/runtime-events.js";

// Run cancellation primitives: mark active runs (and their planned deliveries)
// canceled inside the caller's transaction, then emit one `journey.run.cancel`
// per canceled run AFTER commit so the in-flight `journey-run` Inngest function
// is stopped (cancelOn), not just the DB row.

const ACTIVE_RUN_STATUSES = ["planned", "running"] as const;
export const ACTIVE_RUN_STATUS_SET = new Set<string>(ACTIVE_RUN_STATUSES);

export async function findRunById(
  tx: DbClient,
  runId: string,
): Promise<typeof journeyRuns.$inferSelect | null> {
  const [run] = await tx
    .select()
    .from(journeyRuns)
    .where(eq(journeyRuns.id, runId))
    .limit(1);

  return run ?? null;
}

// Returns the ids of the runs actually transitioned to canceled, so the caller
// can emit a `journey.run.cancel` event per run after the transaction commits
// (which stops the in-flight `journey-run` function, not just the DB row).
export async function cancelRunsByIds(
  tx: DbClient,
  runIds: string[],
  reasonCode: string,
): Promise<string[]> {
  if (runIds.length === 0) {
    return [];
  }

  await tx
    .update(journeyDeliveries)
    .set({
      status: "canceled",
      reasonCode,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        inArray(journeyDeliveries.journeyRunId, runIds),
        eq(journeyDeliveries.status, "planned"),
      ),
    );

  const canceledRuns = await tx
    .update(journeyRuns)
    .set({
      status: "canceled",
      cancelledAt: sql`now()`,
    })
    .where(
      and(
        inArray(journeyRuns.id, runIds),
        inArray(journeyRuns.status, [...ACTIVE_RUN_STATUSES]),
      ),
    )
    .returning({ id: journeyRuns.id });

  return canceledRuns.map((row) => row.id);
}

export async function cancelActiveRunsForJourney(
  tx: DbClient,
  journeyId: string,
  reasonCode: string,
): Promise<string[]> {
  const versionRows = await tx
    .select({ id: journeyVersions.id })
    .from(journeyVersions)
    .where(eq(journeyVersions.journeyId, journeyId));

  const versionIds = versionRows.map((row) => row.id);
  if (versionIds.length === 0) {
    return [];
  }

  const runRows = await tx
    .select({ id: journeyRuns.id })
    .from(journeyRuns)
    .where(
      and(
        inArray(journeyRuns.journeyVersionId, versionIds),
        inArray(journeyRuns.status, [...ACTIVE_RUN_STATUSES]),
      ),
    );

  const runIds = runRows.map((row) => row.id);
  return cancelRunsByIds(tx, runIds, reasonCode);
}

// Emit one journey.run.cancel per canceled run AFTER the transaction commits, so
// the in-flight journey-run function is stopped (cancelOn) in addition to the DB
// row being marked canceled.
export async function emitJourneyRunCancels(
  orgId: string,
  runIds: string[],
): Promise<void> {
  await Promise.all(
    runIds.map((journeyRunId) => sendJourneyRunCancel({ orgId, journeyRunId })),
  );
}
