import { domainEventTypeSchema, type DomainEventType } from "@scheduling/dto";
import {
  appointmentTypes,
  appointments,
  calendars,
  clients,
  locations,
  resources,
  workflowBindings,
  workflowDefinitionVersions,
  workflowDeliveryLog,
  workflowDefinitions,
  workflowRunEntityLinks,
  workflowScheduleBindings,
} from "@scheduling/db/schema";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { withOrg } from "../../lib/db.js";

export type WorkflowDispatchTarget = {
  definitionId: string;
  versionId: string;
  workflowType: string;
  compiledPlan: Record<string, unknown> | null;
};

export type WorkflowScheduleDispatchTarget = {
  bindingId: string;
  definitionId: string;
  versionId: string;
  workflowType: string;
  scheduleExpression: string;
  scheduleTimezone: string;
  nextRunAt: Date | string | null;
  compiledPlan: Record<string, unknown> | null;
};

export type RecordWorkflowRunStartInput = {
  orgId: string;
  runId: string;
  definitionId: string;
  versionId: string | null;
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

export type WorkflowDeliveryRecordResult =
  | "recorded"
  | "duplicate"
  | "guard_blocked";

export type WorkflowRunGuard = {
  runRevision: number;
  runStatus: WorkflowRunStatusValue;
};

export type WorkflowCorrelatedEntityLoadResult =
  | {
      status: "found";
      entityType: string;
      entityId: string;
      entity: Record<string, unknown>;
    }
  | {
      status: "missing";
      entityType: string;
      entityId: string;
    }
  | {
      status: "unsupported_entity_type";
      entityType: string;
      entityId: string;
    };

export function buildWorkflowDeliveryKey(input: {
  runId: string;
  runRevision: number;
  stepId: string;
  channel: string;
  target?: string | null;
}): string {
  return [
    "workflow_delivery",
    input.runId,
    String(input.runRevision),
    input.stepId,
    input.channel,
    input.target ?? "_",
  ].join(":");
}

function normalizeRunStatus(value: string): WorkflowRunStatusValue {
  if (
    value === "pending" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }

  return "unknown";
}

export async function listEnabledWorkflowDispatchTargets(
  orgId: string,
  eventType: DomainEventType,
): Promise<readonly WorkflowDispatchTarget[]> {
  // Guard event type values at runtime for any non-typed callsites.
  domainEventTypeSchema.parse(eventType);

  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .select({
        definitionId: workflowBindings.definitionId,
        versionId: workflowBindings.versionId,
        workflowType: workflowDefinitions.key,
        compiledPlan: workflowDefinitionVersions.compiledPlan,
      })
      .from(workflowBindings)
      .innerJoin(
        workflowDefinitions,
        eq(workflowDefinitions.id, workflowBindings.definitionId),
      )
      .innerJoin(
        workflowDefinitionVersions,
        eq(workflowDefinitionVersions.id, workflowBindings.versionId),
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

export async function listDueWorkflowScheduleDispatchTargets(input: {
  orgId: string;
  now: Date;
}): Promise<readonly WorkflowScheduleDispatchTarget[]> {
  return withOrg(input.orgId, async (tx) => {
    const rows = await tx
      .select({
        bindingId: workflowScheduleBindings.id,
        definitionId: workflowScheduleBindings.definitionId,
        versionId: workflowScheduleBindings.versionId,
        workflowType: workflowDefinitions.key,
        scheduleExpression: workflowScheduleBindings.scheduleExpression,
        scheduleTimezone: workflowScheduleBindings.scheduleTimezone,
        nextRunAt: workflowScheduleBindings.nextRunAt,
        compiledPlan: workflowDefinitionVersions.compiledPlan,
      })
      .from(workflowScheduleBindings)
      .innerJoin(
        workflowDefinitions,
        eq(workflowDefinitions.id, workflowScheduleBindings.definitionId),
      )
      .innerJoin(
        workflowDefinitionVersions,
        eq(workflowDefinitionVersions.id, workflowScheduleBindings.versionId),
      )
      .where(
        and(
          eq(workflowScheduleBindings.enabled, true),
          eq(workflowDefinitions.status, "active"),
          sql`${workflowScheduleBindings.nextRunAt} <= ${input.now}`,
        ),
      );

    return rows;
  });
}

export async function updateWorkflowScheduleBindingNextRunAt(input: {
  orgId: string;
  bindingId: string;
  nextRunAt: Date | null;
}): Promise<void> {
  await withOrg(input.orgId, async (tx) => {
    await tx
      .update(workflowScheduleBindings)
      .set({
        nextRunAt: input.nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(workflowScheduleBindings.id, input.bindingId));
  });
}

export async function listWorkflowScheduleBindings(input: {
  orgId: string;
  definitionId: string;
}): Promise<
  readonly {
    id: string;
    orgId: string;
    definitionId: string;
    versionId: string;
    scheduleExpression: string;
    scheduleTimezone: string;
    nextRunAt: Date | null;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }[]
> {
  return withOrg(input.orgId, async (tx) => {
    return tx
      .select()
      .from(workflowScheduleBindings)
      .where(eq(workflowScheduleBindings.definitionId, input.definitionId))
      .orderBy(desc(workflowScheduleBindings.updatedAt));
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

export async function getWorkflowRunGuard(input: {
  orgId: string;
  runId: string;
}): Promise<WorkflowRunGuard | null> {
  return withOrg(input.orgId, async (tx) => {
    const [runLink] = await tx
      .select({
        runRevision: workflowRunEntityLinks.runRevision,
        runStatus: workflowRunEntityLinks.runStatus,
      })
      .from(workflowRunEntityLinks)
      .where(eq(workflowRunEntityLinks.runId, input.runId))
      .orderBy(
        desc(workflowRunEntityLinks.lastSeenAt),
        desc(workflowRunEntityLinks.startedAt),
      )
      .limit(1);

    if (!runLink) {
      return null;
    }

    return {
      runRevision: runLink.runRevision,
      runStatus: normalizeRunStatus(runLink.runStatus),
    };
  });
}

export async function recordWorkflowDeliveryWithGuard(input: {
  orgId: string;
  definitionId: string;
  versionId: string | null;
  runId: string;
  expectedRunRevision: number;
  workflowType: string;
  stepId: string;
  channel: string;
  target?: string | null;
  deliveryKey: string;
  providerMessageId?: string | null;
  status?: "sent" | "failed";
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<WorkflowDeliveryRecordResult> {
  return withOrg(input.orgId, async (tx) => {
    const [guard] = await tx
      .select({ id: workflowRunEntityLinks.id })
      .from(workflowRunEntityLinks)
      .where(
        and(
          eq(workflowRunEntityLinks.runId, input.runId),
          eq(workflowRunEntityLinks.runRevision, input.expectedRunRevision),
          inArray(workflowRunEntityLinks.runStatus, ["pending", "running"]),
        ),
      )
      .limit(1);

    if (!guard) {
      return "guard_blocked";
    }

    const [inserted] = await tx
      .insert(workflowDeliveryLog)
      .values({
        orgId: input.orgId,
        definitionId: input.definitionId,
        versionId: input.versionId,
        runId: input.runId,
        runRevision: input.expectedRunRevision,
        workflowType: input.workflowType,
        stepId: input.stepId,
        channel: input.channel,
        target: input.target ?? null,
        deliveryKey: input.deliveryKey,
        providerMessageId: input.providerMessageId ?? null,
        status: input.status ?? "sent",
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
      })
      .onConflictDoNothing({
        target: workflowDeliveryLog.deliveryKey,
      })
      .returning({ id: workflowDeliveryLog.id });

    return inserted ? "recorded" : "duplicate";
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

export async function loadWorkflowCompiledPlan(input: {
  orgId: string;
  versionId: string;
}): Promise<Record<string, unknown> | null> {
  return withOrg(input.orgId, async (tx) => {
    const [row] = await tx
      .select({ compiledPlan: workflowDefinitionVersions.compiledPlan })
      .from(workflowDefinitionVersions)
      .where(eq(workflowDefinitionVersions.id, input.versionId))
      .limit(1);

    if (!row) {
      return null;
    }

    return row.compiledPlan;
  });
}

export async function loadWorkflowCorrelatedEntity(input: {
  orgId: string;
  entityType: string;
  entityId: string;
}): Promise<WorkflowCorrelatedEntityLoadResult> {
  return withOrg(input.orgId, async (tx) => {
    const found = (entity: Record<string, unknown>) => ({
      status: "found" as const,
      entityType: input.entityType,
      entityId: input.entityId,
      entity,
    });
    const missing = () => ({
      status: "missing" as const,
      entityType: input.entityType,
      entityId: input.entityId,
    });

    if (input.entityType === "appointment") {
      const [row] = await tx
        .select()
        .from(appointments)
        .where(eq(appointments.id, input.entityId))
        .limit(1);

      return row ? found(row) : missing();
    }

    if (input.entityType === "calendar") {
      const [row] = await tx
        .select()
        .from(calendars)
        .where(eq(calendars.id, input.entityId))
        .limit(1);

      return row ? found(row) : missing();
    }

    if (input.entityType === "appointment_type") {
      const [row] = await tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, input.entityId))
        .limit(1);

      return row ? found(row) : missing();
    }

    if (input.entityType === "resource") {
      const [row] = await tx
        .select()
        .from(resources)
        .where(eq(resources.id, input.entityId))
        .limit(1);

      return row ? found(row) : missing();
    }

    if (input.entityType === "location") {
      const [row] = await tx
        .select()
        .from(locations)
        .where(eq(locations.id, input.entityId))
        .limit(1);

      return row ? found(row) : missing();
    }

    if (input.entityType === "client") {
      const [row] = await tx
        .select()
        .from(clients)
        .where(eq(clients.id, input.entityId))
        .limit(1);

      return row ? found(row) : missing();
    }

    // Schedule-triggered runs correlate to the workflow definition itself.
    if (input.entityType === "workflow") {
      return found({ workflowId: input.entityId });
    }

    return {
      status: "unsupported_entity_type" as const,
      entityType: input.entityType,
      entityId: input.entityId,
    };
  });
}
