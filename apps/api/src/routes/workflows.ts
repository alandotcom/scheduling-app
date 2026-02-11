import {
  cancelWorkflowRunInputSchema,
  cancelWorkflowRunResponseSchema,
  createWorkflowDefinitionSchema,
  getWorkflowRunInputSchema,
  idInputSchema,
  listWorkflowBindingsInputSchema,
  workflowBindingListResponseSchema,
  listWorkflowRunsQuerySchema,
  listWorkflowDefinitionsQuerySchema,
  publishWorkflowDraftInputSchema,
  removeWorkflowBindingInputSchema,
  successResponseSchema,
  upsertWorkflowBindingInputSchema,
  updateWorkflowDraftWorkflowKitSchema,
  validateWorkflowDraftInputSchema,
  workflowBindingSchema,
  workflowDefinitionDetailSchema,
  workflowDefinitionListResponseSchema,
  workflowDefinitionSummarySchema,
  workflowDefinitionVersionSchema,
  workflowRunDetailSchema,
  workflowRunListResponseSchema,
  type WorkflowRunStatus,
  workflowValidationResultSchema,
  type WorkflowKitDocument,
} from "@scheduling/dto";
import {
  workflowBindings,
  workflowDefinitions,
  workflowDefinitionVersions,
  workflowRunEntityLinks,
} from "@scheduling/db/schema";
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { adminOnly, authed } from "./base.js";
import { ApplicationError } from "../errors/application-error.js";
import {
  cancelInngestRunById,
  InngestRuntimeError,
} from "../inngest/runtime.js";
import type { DbClient } from "../lib/db.js";
import { withOrg } from "../lib/db.js";
import { compileWorkflowDocument } from "../services/workflows/compiler.js";

const DEFAULT_WORKFLOW_KIT_SCHEMA_VERSION = 1;
const UNIQUE_CONSTRAINT_VIOLATION = "23505";

type WorkflowDefinitionRow = typeof workflowDefinitions.$inferSelect;
type WorkflowDefinitionVersionRow =
  typeof workflowDefinitionVersions.$inferSelect;
type WorkflowBindingRow = typeof workflowBindings.$inferSelect;
type WorkflowRunEntityLinkRow = typeof workflowRunEntityLinks.$inferSelect;

const updateWorkflowDraftInputSchema = idInputSchema.extend(
  updateWorkflowDraftWorkflowKitSchema.shape,
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

function buildWorkflowChecksum(workflowKit: WorkflowKitDocument): string {
  return createHash("sha256")
    .update(stableStringify(workflowKit))
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
    workflowKitSchemaVersion: row.workflowKitSchemaVersion,
    workflowKit: row.workflowKit,
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

  return workflowDefinitionDetailSchema.parse({
    ...toDefinitionSummary(definition),
    draftWorkflowKit: definition.draftWorkflowKit,
    activeVersion: activeVersion ? toDefinitionVersion(activeVersion) : null,
    bindings: bindings.map((binding) => toBinding(binding)),
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
            draftWorkflowKit: input.workflowKit ?? {},
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
      draftWorkflowKit: definition.draftWorkflowKit,
      activeVersion: null,
      bindings: [],
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
          draftWorkflowKit: input.workflowKit,
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
      return compileWorkflowDocument(definition.draftWorkflowKit).validation;
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

      const compilation = compileWorkflowDocument(definition.draftWorkflowKit);
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
          workflowKitSchemaVersion: DEFAULT_WORKFLOW_KIT_SCHEMA_VERSION,
          workflowKit: definition.draftWorkflowKit,
          compiledPlan: compilation.compiledPlan ?? {},
          checksum: buildWorkflowChecksum(definition.draftWorkflowKit),
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
        .update(workflowBindings)
        .set({
          versionId: publishedVersion.id,
          updatedAt: new Date(),
        })
        .where(eq(workflowBindings.definitionId, definition.id));

      return loadDefinitionDetail(tx, updatedDefinition.id);
    });
  });

export const listBindings = adminOnly
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

      return rows.map((row) => toBinding(row));
    });

    return { items };
  });

export const upsertBinding = adminOnly
  .route({ method: "PUT", path: "/workflows/{id}/bindings/{eventType}" })
  .input(upsertWorkflowBindingInputSchema)
  .output(workflowBindingSchema)
  .handler(async ({ input, context }) => {
    return withOrg(context.orgId, async (tx) => {
      const definition = await getDefinitionById(tx, input.id);

      if (!definition.activeVersionId) {
        throw new ApplicationError(
          "Publish the workflow before binding events",
          {
            code: "UNPROCESSABLE_CONTENT",
          },
        );
      }

      const [binding] = await tx
        .insert(workflowBindings)
        .values({
          orgId: context.orgId,
          definitionId: definition.id,
          versionId: definition.activeVersionId,
          eventType: input.eventType,
          enabled: input.enabled,
        })
        .onConflictDoUpdate({
          target: [
            workflowBindings.orgId,
            workflowBindings.definitionId,
            workflowBindings.eventType,
          ],
          set: {
            versionId: definition.activeVersionId,
            enabled: input.enabled,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!binding) {
        throw new Error(
          "Unexpected empty result when upserting workflow binding",
        );
      }

      return toBinding(binding);
    });
  });

export const removeBinding = adminOnly
  .route({ method: "DELETE", path: "/workflows/{id}/bindings/{eventType}" })
  .input(removeWorkflowBindingInputSchema)
  .output(successResponseSchema)
  .handler(async ({ input, context }) => {
    await withOrg(context.orgId, async (tx) => {
      await getDefinitionById(tx, input.id);

      const [removed] = await tx
        .delete(workflowBindings)
        .where(
          and(
            eq(workflowBindings.definitionId, input.id),
            eq(workflowBindings.eventType, input.eventType),
          ),
        )
        .returning({ id: workflowBindings.id });

      if (!removed) {
        throw new ApplicationError("Workflow binding not found", {
          code: "NOT_FOUND",
        });
      }
    });

    return { success: true as const };
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

export const workflowRoutes = {
  listDefinitions,
  getDefinition,
  createDefinition,
  updateDraft,
  validateDraft,
  publishDraft,
  bindings: {
    list: listBindings,
    upsert: upsertBinding,
    remove: removeBinding,
  },
  listRuns,
  getRun,
  cancelRun,
};
