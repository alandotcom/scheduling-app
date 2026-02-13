import { workflowStepLog } from "@scheduling/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { withOrg } from "../../lib/db.js";

export type LogStepStartInput = {
  orgId: string;
  runId: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  input: Record<string, unknown> | null;
};

export type LogStepCompleteInput = {
  orgId: string;
  logId: string;
  status: "success" | "error" | "skipped";
  output?: Record<string, unknown> | null;
  errorMessage?: string | null;
};

export async function logStepStart(
  input: LogStepStartInput,
): Promise<{ logId: string; startTime: number }> {
  const startTime = Date.now();
  const now = new Date(startTime);

  const [row] = await withOrg(input.orgId, async (tx) => {
    return tx
      .insert(workflowStepLog)
      .values({
        orgId: input.orgId,
        runId: input.runId,
        nodeId: input.nodeId,
        nodeName: input.nodeName,
        nodeType: input.nodeType,
        status: "running",
        input: input.input,
        startedAt: now,
      })
      .returning({ id: workflowStepLog.id });
  });

  return { logId: row!.id, startTime };
}

export async function logStepComplete(
  input: LogStepCompleteInput,
): Promise<void> {
  const now = new Date();

  await withOrg(input.orgId, async (tx) => {
    // Read startedAt to compute duration
    const [existing] = await tx
      .select({ startedAt: workflowStepLog.startedAt })
      .from(workflowStepLog)
      .where(eq(workflowStepLog.id, input.logId))
      .limit(1);

    const durationMs =
      existing?.startedAt != null
        ? Math.max(0, now.getTime() - existing.startedAt.getTime())
        : null;

    await tx
      .update(workflowStepLog)
      .set({
        status: input.status,
        output: input.output ?? null,
        errorMessage: input.errorMessage ?? null,
        completedAt: now,
        durationMs,
        updatedAt: now,
      })
      .where(eq(workflowStepLog.id, input.logId));
  });
}

export type ListStepLogsInput = {
  orgId: string;
  runId: string;
};

export async function listStepLogs(input: ListStepLogsInput) {
  return withOrg(input.orgId, async (tx) => {
    return tx
      .select()
      .from(workflowStepLog)
      .where(and(eq(workflowStepLog.runId, input.runId)))
      .orderBy(asc(workflowStepLog.startedAt), asc(workflowStepLog.createdAt));
  });
}
