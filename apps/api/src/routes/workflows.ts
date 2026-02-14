import {
  cancelWorkflowRunInputSchema,
  cancelWorkflowRunResponseSchema,
  createWorkflowDefinitionSchema,
  getWorkflowRunInputSchema,
  idInputSchema,
  listWorkflowBindingsInputSchema,
  listWorkflowStepLogsInputSchema,
  workflowBindingListResponseSchema,
  workflowCatalogResponseSchema,
  listWorkflowRunsQuerySchema,
  listWorkflowDefinitionsQuerySchema,
  publishWorkflowDraftInputSchema,
  runWorkflowDraftInputSchema,
  runWorkflowDraftResponseSchema,
  updateWorkflowDraftWorkflowGraphSchema,
  validateWorkflowDraftInputSchema,
  workflowBindingSchema,
  workflowDefinitionDetailSchema,
  workflowDefinitionListResponseSchema,
  workflowDefinitionSummarySchema,
  workflowDefinitionVersionSchema,
  workflowRunDetailSchema,
  workflowRunListResponseSchema,
  workflowScheduleBindingSchema,
  workflowStepLogListResponseSchema,
  type WorkflowRunStatus,
  workflowValidationResultSchema,
  type WorkflowGraphDocument,
} from "@scheduling/dto";
import {
  workflowBindings,
  workflowDefinitions,
  workflowDefinitionVersions,
  workflowRunEntityLinks,
  workflowScheduleBindings,
} from "@scheduling/db/schema";
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { CronExpressionParser } from "cron-parser";
import { createHash, randomUUID } from "node:crypto";
import { adminOnly, authed } from "./base.js";
import { ApplicationError } from "../errors/application-error.js";
import { inngest } from "../inngest/client.js";
import {
  cancelInngestRunById,
  InngestRuntimeError,
} from "../inngest/runtime.js";
import type { DbClient } from "../lib/db.js";
import { withOrg } from "../lib/db.js";
import { compileWorkflowDocument } from "../services/workflows/compiler.js";
import {
  listWorkflowActionDefinitions,
  listWorkflowTriggerDefinitions,
} from "../services/workflows/registry.js";
import { listStepLogs } from "../services/workflows/step-logging.js";

const DEFAULT_WORKFLOW_GRAPH_SCHEMA_VERSION = 1;
const UNIQUE_CONSTRAINT_VIOLATION = "23505";

type WorkflowDefinitionRow = typeof workflowDefinitions.$inferSelect;
type WorkflowDefinitionVersionRow =
  typeof workflowDefinitionVersions.$inferSelect;
type WorkflowBindingRow = typeof workflowBindings.$inferSelect;
type WorkflowScheduleBindingRow = typeof workflowScheduleBindings.$inferSelect;
type WorkflowRunEntityLinkRow = typeof workflowRunEntityLinks.$inferSelect;

const updateWorkflowDraftInputSchema = idInputSchema.extend(
  updateWorkflowDraftWorkflowGraphSchema.shape,
);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (isRecord(value)) {
    const entries = Object.entries(value).toSorted(([left], [right]) =>
      left.localeCompare(right),
    );

    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableStringify(entryValue)}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildWorkflowChecksum(workflowGraph: WorkflowGraphDocument): string {
  return createHash("sha256")
    .update(stableStringify(workflowGraph))
    .digest("hex");
}

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  if ("code" in error && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
    return true;
  }

  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const { cause } = error;
    if ("code" in cause && cause.code === UNIQUE_CONSTRAINT_VIOLATION) {
      return true;
    }
    if ("errno" in cause && cause.errno === UNIQUE_CONSTRAINT_VIOLATION) {
      return true;
    }
  }

  return false;
}

function toDefinitionSummary(row: WorkflowDefinitionRow) {
  return workflowDefinitionSummarySchema.parse({
    id: row.id,
    orgId: row.orgId,
    key: row.key,
    name: row.name,
    description: row.description,
    status: row.status,
    draftRevision: row.draftRevision,
    activeVersionId: row.activeVersionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toDefinitionVersion(row: WorkflowDefinitionVersionRow) {
  return workflowDefinitionVersionSchema.parse({
    id: row.id,
    orgId: row.orgId,
    definitionId: row.definitionId,
    version: row.version,
    workflowGraphSchemaVersion: row.workflowGraphSchemaVersion,
    workflowGraph: row.workflowGraph,
    compiledPlan: row.compiledPlan,
    checksum: row.checksum,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toBinding(row: WorkflowBindingRow) {
  return workflowBindingSchema.parse({
    id: row.id,
    orgId: row.orgId,
    definitionId: row.definitionId,
    versionId: row.versionId,
    eventType: row.eventType,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toScheduleBinding(row: WorkflowScheduleBindingRow) {
  return workflowScheduleBindingSchema.parse({
    id: row.id,
    orgId: row.orgId,
    definitionId: row.definitionId,
    versionId: row.versionId,
    scheduleExpression: row.scheduleExpression,
    scheduleTimezone: row.scheduleTimezone,
    nextRunAt: row.nextRunAt,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function computeNextScheduleRunAt(input: {
  expression: string;
  timezone: string;
  currentDate: Date;
}): Date | null {
  try {
    const parsed = CronExpressionParser.parse(input.expression, {
      currentDate: input.currentDate,
      tz: input.timezone,
    });
    return parsed.next().toDate();
  } catch {
    return null;
  }
}

function toWorkflowRunStatus(value: string): WorkflowRunStatus {
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

function toRunSummary(row: WorkflowRunEntityLinkRow) {
  return {
    runId: row.runId,
    workflowType: row.workflowType,
    entityType: row.entityType,
    entityId: row.entityId,
    runRevision: row.runRevision,
    status: toWorkflowRunStatus(row.runStatus),
    startedAt: row.startedAt,
    updatedAt: row.lastSeenAt,
  };
}

async function getDefinitionById(
  tx: DbClient,
  definitionId: string,
): Promise<WorkflowDefinitionRow> {
  const [definition] = await tx
    .select()
    .from(workflowDefinitions)
    .where(eq(workflowDefinitions.id, definitionId))
    .limit(1);

  if (!definition) {
    throw new ApplicationError("Workflow definition not found", {
      code: "NOT_FOUND",
    });
  }

  return definition;
}

async function loadDefinitionDetail(tx: DbClient, definitionId: string) {
  const definition = await getDefinitionById(tx, definitionId);
  const activeVersion =
    definition.activeVersionId === null
      ? null
      : await tx
          .select()
          .from(workflowDefinitionVersions)
          .where(eq(workflowDefinitionVersions.id, definition.activeVersionId))
          .limit(1)
          .then((rows) => rows[0] ?? null);
  const bindings = await tx
    .select()
    .from(workflowBindings)
    .where(eq(workflowBindings.definitionId, definition.id))
    .orderBy(
      desc(workflowBindings.updatedAt),
      desc(workflowBindings.createdAt),
    );
  const scheduleBindings = await tx
    .select()
    .from(workflowScheduleBindings)
    .where(eq(workflowScheduleBindings.definitionId, definition.id))
    .orderBy(desc(workflowScheduleBindings.updatedAt));

  return workflowDefinitionDetailSchema.parse({
    ...toDefinitionSummary(definition),
    draftWorkflowGraph: definition.draftWorkflowGraph,
    activeVersion: activeVersion ? toDefinitionVersion(activeVersion) : null,
    bindings: bindings.map((binding) => toBinding(binding)),
    scheduleBindings: scheduleBindings.map((binding) =>
      toScheduleBinding(binding),
    ),
  });
}

export const listDefinitions = authed
  .route({ method: "GET", path: "/workflows" })
  .input(listWorkflowDefinitionsQuerySchema)
  .output(workflowDefinitionListResponseSchema)
  .handler(async ({ input, context }) => {
    const items = await withOrg(context.orgId, async (tx) => {
      const conditions: SQL[] = [];

      if (input.status) {
        conditions.push(eq(workflowDefinitions.status, input.status));
      }

      const search = input.search?.trim();
      if (search) {
        conditions.push(
          or(
            ilike(workflowDefinitions.key, `%${search}%`),
            ilike(workflowDefinitions.name, `%${search}%`),
          )!,
        );
      }

      const query = tx.select().from(workflowDefinitions);
      const filteredQuery =
        conditions.length > 0 ? query.where(and(...conditions)) : query;
      const rows = await filteredQuery.orderBy(
        desc(workflowDefinitions.updatedAt),
        desc(workflowDefinitions.createdAt),
      );

      return rows.map((row) => toDefinitionSummary(row));
    });

    return { items };
  });

export const getCatalog = authed
  .route({ method: "GET", path: "/workflows/catalog" })
  .output(workflowCatalogResponseSchema)
  .handler(async () => {
    return workflowCatalogResponseSchema.parse({
      triggers: listWorkflowTriggerDefinitions(),
      actions: listWorkflowActionDefinitions().map((action) => ({
        id: action.id,
        label: action.label,
        description: action.description,
        category: action.category,
        configFields: action.configFields,
        outputFields: action.outputFields,
      })),
    });
  });

export const getDefinition = authed
  .route({ method: "GET", path: "/workflows/{id}" })
  .input(idInputSchema)
  .output(workflowDefinitionDetailSchema)
  .handler(async ({ input, context }) => {
    return withOrg(context.orgId, async (tx) =>
      loadDefinitionDetail(tx, input.id),
    );
  });

export const createDefinition = adminOnly
  .route({ method: "POST", path: "/workflows", successStatus: 201 })
  .input(createWorkflowDefinitionSchema)
  .output(workflowDefinitionDetailSchema)
  .handler(async ({ input, context }) => {
    const definition = await withOrg(context.orgId, async (tx) => {
      try {
        const [created] = await tx
          .insert(workflowDefinitions)
          .values({
            orgId: context.orgId,
            key: input.key,
            name: input.name,
            description: input.description ?? null,
            draftWorkflowGraph: input.workflowGraph ?? {},
          })
          .returning();

        if (!created) {
          throw new Error(
            "Unexpected empty result when creating workflow definition",
          );
        }

        return created;
      } catch (error: unknown) {
        if (isUniqueConstraintViolation(error)) {
          throw new ApplicationError("Workflow key already exists", {
            code: "CONFLICT",
          });
        }

        throw error;
      }
    });

    return workflowDefinitionDetailSchema.parse({
      ...toDefinitionSummary(definition),
      draftWorkflowGraph: definition.draftWorkflowGraph,
      activeVersion: null,
      bindings: [],
      scheduleBindings: [],
    });
  });

export const updateDraft = adminOnly
  .route({ method: "PATCH", path: "/workflows/{id}/draft" })
  .input(updateWorkflowDraftInputSchema)
  .output(workflowDefinitionDetailSchema)
  .handler(async ({ input, context }) => {
    return withOrg(context.orgId, async (tx) => {
      const definition = await getDefinitionById(tx, input.id);

      if (
        input.expectedRevision !== undefined &&
        definition.draftRevision !== input.expectedRevision
      ) {
        throw new ApplicationError("Workflow draft revision conflict", {
          code: "CONFLICT",
          details: {
            expectedRevision: input.expectedRevision,
            actualRevision: definition.draftRevision,
          },
        });
      }

      const [updated] = await tx
        .update(workflowDefinitions)
        .set({
          draftWorkflowGraph: input.workflowGraph,
          draftRevision: definition.draftRevision + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowDefinitions.id, definition.id),
            eq(workflowDefinitions.draftRevision, definition.draftRevision),
          ),
        )
        .returning();

      if (!updated) {
        throw new ApplicationError("Workflow draft revision conflict", {
          code: "CONFLICT",
        });
      }

      return loadDefinitionDetail(tx, definition.id);
    });
  });

export const validateDraft = adminOnly
  .route({ method: "POST", path: "/workflows/{id}/validate" })
  .input(validateWorkflowDraftInputSchema)
  .output(workflowValidationResultSchema)
  .handler(async ({ input, context }) => {
    return withOrg(context.orgId, async (tx) => {
      const definition = await getDefinitionById(tx, input.id);
      return compileWorkflowDocument(definition.draftWorkflowGraph).validation;
    });
  });

export const publishDraft = adminOnly
  .route({ method: "POST", path: "/workflows/{id}/publish" })
  .input(publishWorkflowDraftInputSchema)
  .output(workflowDefinitionDetailSchema)
  .handler(async ({ input, context }) => {
    return withOrg(context.orgId, async (tx) => {
      const definition = await getDefinitionById(tx, input.id);

      if (
        input.expectedRevision !== undefined &&
        definition.draftRevision !== input.expectedRevision
      ) {
        throw new ApplicationError("Workflow draft revision conflict", {
          code: "CONFLICT",
          details: {
            expectedRevision: input.expectedRevision,
            actualRevision: definition.draftRevision,
          },
        });
      }

      const compilation = compileWorkflowDocument(
        definition.draftWorkflowGraph,
      );
      const validation = compilation.validation;
      if (!validation.valid) {
        throw new ApplicationError("Workflow draft is invalid", {
          code: "UNPROCESSABLE_CONTENT",
          details: {
            issues: validation.issues,
          },
        });
      }

      const [latestVersion] = await tx
        .select()
        .from(workflowDefinitionVersions)
        .where(eq(workflowDefinitionVersions.definitionId, definition.id))
        .orderBy(desc(workflowDefinitionVersions.version))
        .limit(1);

      const [publishedVersion] = await tx
        .insert(workflowDefinitionVersions)
        .values({
          orgId: definition.orgId,
          definitionId: definition.id,
          version: (latestVersion?.version ?? 0) + 1,
          workflowGraphSchemaVersion: DEFAULT_WORKFLOW_GRAPH_SCHEMA_VERSION,
          workflowGraph: definition.draftWorkflowGraph,
          compiledPlan: compilation.compiledPlan ?? {},
          checksum: buildWorkflowChecksum(definition.draftWorkflowGraph),
          createdBy: context.userId,
        })
        .returning();

      if (!publishedVersion) {
        throw new Error(
          "Unexpected empty result when creating workflow definition version",
        );
      }

      const [updatedDefinition] = await tx
        .update(workflowDefinitions)
        .set({
          status: "active",
          activeVersionId: publishedVersion.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowDefinitions.id, definition.id),
            eq(workflowDefinitions.draftRevision, definition.draftRevision),
          ),
        )
        .returning();

      if (!updatedDefinition) {
        throw new ApplicationError("Workflow draft revision conflict", {
          code: "CONFLICT",
        });
      }

      await tx
        .delete(workflowBindings)
        .where(eq(workflowBindings.definitionId, definition.id));

      await tx
        .delete(workflowScheduleBindings)
        .where(eq(workflowScheduleBindings.definitionId, definition.id));

      const trigger = isRecord(compilation.compiledPlan)
        ? compilation.compiledPlan["trigger"]
        : null;

      if (isRecord(trigger)) {
        const triggerType = trigger["type"];

        if (triggerType === "domain_event") {
          const startEvents = Array.isArray(trigger["startEvents"])
            ? trigger["startEvents"].filter(
                (entry): entry is string => typeof entry === "string",
              )
            : [];
          const restartEvents = Array.isArray(trigger["restartEvents"])
            ? trigger["restartEvents"].filter(
                (entry): entry is string => typeof entry === "string",
              )
            : [];
          const stopEvents = Array.isArray(trigger["stopEvents"])
            ? trigger["stopEvents"].filter(
                (entry): entry is string => typeof entry === "string",
              )
            : [];
          const allEvents = [
            ...new Set([...startEvents, ...restartEvents, ...stopEvents]),
          ];

          if (allEvents.length > 0) {
            await tx.insert(workflowBindings).values(
              allEvents.map((eventType) => ({
                orgId: context.orgId,
                definitionId: definition.id,
                versionId: publishedVersion.id,
                eventType,
                enabled: true,
              })),
            );
          }
        } else if (triggerType === "schedule") {
          const scheduleExpression =
            typeof trigger["expression"] === "string"
              ? trigger["expression"].trim()
              : "";
          const scheduleTimezone =
            typeof trigger["timezone"] === "string"
              ? trigger["timezone"].trim()
              : "";

          if (!scheduleExpression || !scheduleTimezone) {
            throw new ApplicationError(
              "Schedule trigger is missing configuration",
              {
                code: "UNPROCESSABLE_CONTENT",
              },
            );
          }

          const nextRunAt = computeNextScheduleRunAt({
            expression: scheduleExpression,
            timezone: scheduleTimezone,
            currentDate: new Date(),
          });

          if (!nextRunAt) {
            throw new ApplicationError("Schedule expression is invalid", {
              code: "UNPROCESSABLE_CONTENT",
            });
          }

          await tx.insert(workflowScheduleBindings).values({
            orgId: context.orgId,
            definitionId: definition.id,
            versionId: publishedVersion.id,
            scheduleExpression,
            scheduleTimezone,
            nextRunAt,
            enabled: true,
          });
        }
      }

      return loadDefinitionDetail(tx, updatedDefinition.id);
    });
  });

export const runDraft = adminOnly
  .route({ method: "POST", path: "/workflows/{id}/run-draft" })
  .input(runWorkflowDraftInputSchema)
  .output(runWorkflowDraftResponseSchema)
  .handler(async ({ input, context }) => {
    const eventTimestamp = new Date().toISOString();

    const workflow = await withOrg(context.orgId, async (tx) => {
      const definition = await getDefinitionById(tx, input.id);
      const compilation = compileWorkflowDocument(
        definition.draftWorkflowGraph,
      );
      const validation = compilation.validation;

      if (!validation.valid || !compilation.compiledPlan) {
        throw new ApplicationError("Workflow draft is invalid", {
          code: "UNPROCESSABLE_CONTENT",
          details: {
            issues: validation.issues,
          },
        });
      }

      return {
        definitionId: definition.id,
        workflowType: definition.key,
        compiledPlan: compilation.compiledPlan,
      };
    });

    const triggerEventId = [
      "manual",
      context.orgId,
      workflow.definitionId,
      randomUUID(),
    ].join(":");

    await inngest.send({
      id: triggerEventId,
      name: "scheduling/workflow.triggered",
      data: {
        orgId: context.orgId,
        workflow: {
          definitionId: workflow.definitionId,
          versionId: null,
          workflowType: workflow.workflowType,
          compiledPlan: workflow.compiledPlan,
        },
        sourceEvent: {
          id: triggerEventId,
          type: "manual.triggered",
          timestamp: eventTimestamp,
          payload: {
            triggeredByUserId: context.userId,
            triggerMode: "draft_manual",
          },
        },
        entity: {
          type: input.entityType,
          id: input.entityId,
        },
      },
    });

    return runWorkflowDraftResponseSchema.parse({
      success: true,
      triggerEventId,
    });
  });

export const listBindings = authed
  .route({ method: "GET", path: "/workflows/{id}/bindings" })
  .input(listWorkflowBindingsInputSchema)
  .output(workflowBindingListResponseSchema)
  .handler(async ({ input, context }) => {
    const items = await withOrg(context.orgId, async (tx) => {
      await getDefinitionById(tx, input.id);

      const rows = await tx
        .select()
        .from(workflowBindings)
        .where(eq(workflowBindings.definitionId, input.id))
        .orderBy(asc(workflowBindings.eventType));
      const scheduleRows = await tx
        .select()
        .from(workflowScheduleBindings)
        .where(eq(workflowScheduleBindings.definitionId, input.id))
        .orderBy(desc(workflowScheduleBindings.updatedAt));

      return {
        items: rows.map((row) => toBinding(row)),
        schedules: scheduleRows.map((row) => toScheduleBinding(row)),
      };
    });

    return items;
  });

export const listRuns = authed
  .route({ method: "GET", path: "/workflows/runs" })
  .input(listWorkflowRunsQuerySchema)
  .output(workflowRunListResponseSchema)
  .handler(async ({ input, context }) => {
    const items = await withOrg(context.orgId, async (tx) => {
      const conditions: SQL[] = [];

      if (input.definitionId) {
        conditions.push(
          eq(workflowRunEntityLinks.definitionId, input.definitionId),
        );
      }

      if (input.workflowType) {
        conditions.push(
          eq(workflowRunEntityLinks.workflowType, input.workflowType),
        );
      }

      if (input.entityType) {
        conditions.push(
          eq(workflowRunEntityLinks.entityType, input.entityType),
        );
      }

      if (input.entityId) {
        conditions.push(eq(workflowRunEntityLinks.entityId, input.entityId));
      }

      if (input.status) {
        conditions.push(eq(workflowRunEntityLinks.runStatus, input.status));
      }

      const query = tx.select().from(workflowRunEntityLinks);
      const filteredQuery =
        conditions.length > 0 ? query.where(and(...conditions)) : query;

      const rows = await filteredQuery
        .orderBy(
          desc(workflowRunEntityLinks.lastSeenAt),
          desc(workflowRunEntityLinks.startedAt),
        )
        .limit(input.limit);

      return rows.map((row) => toRunSummary(row));
    });

    return workflowRunListResponseSchema.parse({ items });
  });

export const getRun = authed
  .route({ method: "GET", path: "/workflows/runs/{runId}" })
  .input(getWorkflowRunInputSchema)
  .output(workflowRunDetailSchema)
  .handler(async ({ input, context }) => {
    return withOrg(context.orgId, async (tx) => {
      const [runLink] = await tx
        .select()
        .from(workflowRunEntityLinks)
        .where(eq(workflowRunEntityLinks.runId, input.runId))
        .orderBy(
          desc(workflowRunEntityLinks.lastSeenAt),
          desc(workflowRunEntityLinks.startedAt),
        )
        .limit(1);

      if (!runLink) {
        throw new ApplicationError("Workflow run not found", {
          code: "NOT_FOUND",
        });
      }

      return workflowRunDetailSchema.parse({
        ...toRunSummary(runLink),
        definitionVersionId: runLink.versionId,
      });
    });
  });

export const cancelRun = adminOnly
  .route({ method: "POST", path: "/workflows/runs/{runId}/cancel" })
  .input(cancelWorkflowRunInputSchema)
  .output(cancelWorkflowRunResponseSchema)
  .handler(async ({ input, context }) => {
    await withOrg(context.orgId, async (tx) => {
      const [runLink] = await tx
        .select({ id: workflowRunEntityLinks.id })
        .from(workflowRunEntityLinks)
        .where(eq(workflowRunEntityLinks.runId, input.runId))
        .limit(1);

      if (!runLink) {
        throw new ApplicationError("Workflow run not found", {
          code: "NOT_FOUND",
        });
      }
    });

    try {
      await cancelInngestRunById(input.runId);
    } catch (error: unknown) {
      if (error instanceof InngestRuntimeError && error.status === 404) {
        throw new ApplicationError("Workflow run not found in Inngest", {
          code: "NOT_FOUND",
        });
      }

      if (error instanceof InngestRuntimeError) {
        throw new ApplicationError(error.message, {
          code: "BAD_REQUEST",
        });
      }

      throw error;
    }

    await withOrg(context.orgId, async (tx) => {
      const now = new Date();

      await tx
        .update(workflowRunEntityLinks)
        .set({
          runStatus: "cancelled",
          cancelledAt: now,
          lastSeenAt: now,
          updatedAt: now,
          runRevision: sql`${workflowRunEntityLinks.runRevision} + 1`,
        })
        .where(eq(workflowRunEntityLinks.runId, input.runId));
    });

    return { success: true as const };
  });

export const listRunSteps = authed
  .route({ method: "GET", path: "/workflows/runs/{runId}/steps" })
  .input(listWorkflowStepLogsInputSchema)
  .output(workflowStepLogListResponseSchema)
  .handler(async ({ input, context }) => {
    const rows = await listStepLogs({
      orgId: context.orgId,
      runId: input.runId,
    });

    return workflowStepLogListResponseSchema.parse({
      items: rows.map((row) => ({
        id: row.id,
        orgId: row.orgId,
        runId: row.runId,
        nodeId: row.nodeId,
        nodeName: row.nodeName,
        nodeType: row.nodeType,
        status: row.status,
        input: row.input,
        output: row.output,
        errorMessage: row.errorMessage,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        durationMs: row.durationMs,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    });
  });

export const workflowRoutes = {
  catalog: getCatalog,
  listDefinitions,
  getDefinition,
  createDefinition,
  updateDraft,
  validateDraft,
  publishDraft,
  runDraft,
  bindings: {
    list: listBindings,
  },
  listRuns,
  getRun,
  cancelRun,
  listRunSteps,
};
