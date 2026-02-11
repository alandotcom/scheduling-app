import {
  createWorkflowDefinitionSchema,
  idInputSchema,
  listWorkflowDefinitionsQuerySchema,
  publishWorkflowDraftInputSchema,
  updateWorkflowDraftWorkflowKitSchema,
  validateWorkflowDraftInputSchema,
  workflowBindingSchema,
  workflowDefinitionDetailSchema,
  workflowDefinitionListResponseSchema,
  workflowDefinitionSummarySchema,
  workflowDefinitionVersionSchema,
  workflowValidationResultSchema,
  type WorkflowKitDocument,
  type WorkflowValidationResult,
} from "@scheduling/dto";
import {
  workflowBindings,
  workflowDefinitions,
  workflowDefinitionVersions,
} from "@scheduling/db/schema";
import type { SQL } from "drizzle-orm";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { createHash } from "node:crypto";
import { adminOnly } from "./base.js";
import { ApplicationError } from "../errors/application-error.js";
import type { DbClient } from "../lib/db.js";
import { withOrg } from "../lib/db.js";

const DEFAULT_WORKFLOW_KIT_SCHEMA_VERSION = 1;
const UNIQUE_CONSTRAINT_VIOLATION = "23505";

type WorkflowDefinitionRow = typeof workflowDefinitions.$inferSelect;
type WorkflowDefinitionVersionRow =
  typeof workflowDefinitionVersions.$inferSelect;
type WorkflowBindingRow = typeof workflowBindings.$inferSelect;

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

function validateWorkflowKitDraft(
  workflowKit: WorkflowKitDocument,
): WorkflowValidationResult {
  if (Object.keys(workflowKit).length > 0) {
    return workflowValidationResultSchema.parse({
      valid: true,
      issues: [],
    });
  }

  return workflowValidationResultSchema.parse({
    valid: false,
    issues: [
      {
        code: "MISSING_REQUIRED_FIELD",
        severity: "error",
        field: "workflowKit",
        message: "Workflow draft cannot be empty",
      },
    ],
  });
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

export const listDefinitions = adminOnly
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

export const getDefinition = adminOnly
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
      return validateWorkflowKitDraft(definition.draftWorkflowKit);
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

      const validation = validateWorkflowKitDraft(definition.draftWorkflowKit);
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
          compiledPlan: {},
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

export const workflowRoutes = {
  listDefinitions,
  getDefinition,
  createDefinition,
  updateDraft,
  validateDraft,
  publishDraft,
};
