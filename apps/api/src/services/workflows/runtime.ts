import { webhookEventTypeSchema, type WebhookEventType } from "@scheduling/dto";
import {
  workflowBindings,
  workflowDefinitions,
  workflowRunEntityLinks,
} from "@scheduling/db/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { withOrg } from "../../lib/db.js";

export type WorkflowDispatchTarget = {
  definitionId: string;
  versionId: string;
  workflowType: string;
};

export type RecordWorkflowRunStartInput = {
  orgId: string;
  runId: string;
  definitionId: string;
  versionId: string;
  workflowType: string;
  entityType: string;
  entityId: string;
};

export type WorkflowRunStatusValue =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown";

export async function listEnabledWorkflowDispatchTargets(
  orgId: string,
  eventType: WebhookEventType,
): Promise<readonly WorkflowDispatchTarget[]> {
  // Guard event type values at runtime for any non-typed callsites.
  webhookEventTypeSchema.parse(eventType);

  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select({
        definitionId: workflowBindings.definitionId,
        versionId: workflowBindings.versionId,
        workflowType: workflowDefinitions.key,
      })
      .from(workflowBindings)
      .innerJoin(
        workflowDefinitions,
        eq(workflowDefinitions.id, workflowBindings.definitionId),
      )
      .where(
        and(
          eq(workflowBindings.eventType, eventType),
          eq(workflowBindings.enabled, true),
          eq(workflowDefinitions.status, "active"),
        ),
      );

    return rows;
  });
}

export async function recordWorkflowRunStart(
  input: RecordWorkflowRunStartInput,
): Promise<void> {
  await withOrg(input.orgId, async (tx) => {
    const now = new Date();

    await tx
      .insert(workflowRunEntityLinks)
      .values({
        orgId: input.orgId,
        definitionId: input.definitionId,
        versionId: input.versionId,
        runId: input.runId,
        workflowType: input.workflowType,
        runRevision: 1,
        entityType: input.entityType,
        entityId: input.entityId,
        runStatus: "running",
        startedAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [
          workflowRunEntityLinks.orgId,
          workflowRunEntityLinks.runId,
          workflowRunEntityLinks.entityType,
          workflowRunEntityLinks.entityId,
        ],
        set: {
          definitionId: input.definitionId,
          versionId: input.versionId,
          workflowType: input.workflowType,
          runStatus: "running",
          lastSeenAt: now,
          updatedAt: now,
        },
      });
  });
}

export async function markWorkflowRunStatus(input: {
  orgId: string;
  runId: string;
  status: WorkflowRunStatusValue;
}): Promise<void> {
  await withOrg(input.orgId, async (tx) => {
    const now = new Date();

    await tx
      .update(workflowRunEntityLinks)
      .set({
        runStatus: input.status,
        lastSeenAt: now,
        updatedAt: now,
        ...(input.status === "cancelled" ? { cancelledAt: now } : {}),
      })
      .where(eq(workflowRunEntityLinks.runId, input.runId));
  });
}

export async function cancelReplacedWorkflowRuns(input: {
  orgId: string;
  definitionId: string;
  entityType: string;
  entityId: string;
  replacementRunId: string;
}): Promise<number> {
  return withOrg(input.orgId, async (tx) => {
    const now = new Date();

    const updated = await tx
      .update(workflowRunEntityLinks)
      .set({
        runStatus: "cancelled",
        cancelledAt: now,
        lastSeenAt: now,
        updatedAt: now,
        runRevision: sql`${workflowRunEntityLinks.runRevision} + 1`,
      })
      .where(
        and(
          eq(workflowRunEntityLinks.definitionId, input.definitionId),
          eq(workflowRunEntityLinks.entityType, input.entityType),
          eq(workflowRunEntityLinks.entityId, input.entityId),
          ne(workflowRunEntityLinks.runId, input.replacementRunId),
          inArray(workflowRunEntityLinks.runStatus, ["pending", "running"]),
        ),
      )
      .returning({ id: workflowRunEntityLinks.id });

    return updated.length;
  });
}
