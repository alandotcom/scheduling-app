import { journeyDeliveries, journeyRuns } from "@scheduling/db/schema";
import { eq, sql } from "drizzle-orm";
import { withOrg, type DbClient } from "../lib/db.js";

export async function refreshRunStatusTx(
  tx: DbClient,
  runId: string,
): Promise<void> {
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
    await tx
      .update(journeyRuns)
      .set({
        status: "completed",
        completedAt: sql`now()`,
        cancelledAt: null,
      })
      .where(eq(journeyRuns.id, runId));
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
}

export async function refreshJourneyRunStatus(
  orgId: string,
  runId: string,
): Promise<void> {
  await withOrg(orgId, (tx) => refreshRunStatusTx(tx, runId));
}
