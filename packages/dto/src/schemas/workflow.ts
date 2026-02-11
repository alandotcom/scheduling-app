import { z } from "zod";
import {
  successResponseSchema,
  timestampSchema,
  timestampsSchema,
  uuidSchema,
} from "./common";
import { webhookEventTypeSchema } from "./webhook";

const workflowKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, {
    message:
      "Workflow key must start with a letter/number and only include lowercase letters, numbers, underscores, and hyphens",
  });

export const workflowDefinitionStatusSchema = z.enum([
  "draft",
  "active",
  "archived",
]);

export const workflowKitDocumentSchema = z.record(z.string(), z.unknown());

export const workflowValidationIssueCodeSchema = z.enum([
  "MISSING_REQUIRED_FIELD",
  "BROKEN_REFERENCE",
  "INVALID_EDGE",
  "CYCLE_DETECTED",
  "UNREACHABLE_NODE",
  "INVALID_EXPRESSION",
  "MISSING_INTEGRATION",
]);

export const workflowValidationIssueSchema = z.object({
  code: workflowValidationIssueCodeSchema,
  severity: z.enum(["error", "warning"]),
  nodeId: z.string().optional(),
  edgeId: z.string().optional(),
  field: z.string().optional(),
  message: z.string().min(1),
});

export const workflowValidationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(workflowValidationIssueSchema),
});

export const workflowDefinitionSummarySchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  key: workflowKeySchema,
  name: z.string().min(1).max(255),
  description: z.string().nullable(),
  status: workflowDefinitionStatusSchema,
  draftRevision: z.number().int().positive(),
  activeVersionId: uuidSchema.nullable(),
  ...timestampsSchema.shape,
});

export const workflowDefinitionVersionSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  definitionId: uuidSchema,
  version: z.number().int().positive(),
  workflowKitSchemaVersion: z.number().int().positive(),
  workflowKit: workflowKitDocumentSchema,
  compiledPlan: z.record(z.string(), z.unknown()),
  checksum: z.string().min(1),
  createdBy: uuidSchema.nullable(),
  ...timestampsSchema.shape,
});

export const workflowBindingSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  definitionId: uuidSchema,
  versionId: uuidSchema,
  eventType: webhookEventTypeSchema,
  enabled: z.boolean(),
  ...timestampsSchema.shape,
});

export const workflowDefinitionDetailSchema =
  workflowDefinitionSummarySchema.extend({
    draftWorkflowKit: workflowKitDocumentSchema,
    activeVersion: workflowDefinitionVersionSchema.nullable(),
    bindings: z.array(workflowBindingSchema),
  });

export const workflowDefinitionListResponseSchema = z.object({
  items: z.array(workflowDefinitionSummarySchema),
});

export const workflowRunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "unknown",
]);

export const workflowRunSummarySchema = z.object({
  runId: z.string().min(1),
  workflowType: z.string().min(1),
  entityType: z.string().min(1),
  entityId: uuidSchema,
  runRevision: z.number().int().positive(),
  status: workflowRunStatusSchema,
  startedAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const workflowRunListResponseSchema = z.object({
  items: z.array(workflowRunSummarySchema),
});

export const workflowRunDetailSchema = workflowRunSummarySchema.extend({
  definitionVersionId: uuidSchema.nullable(),
});

export const listWorkflowDefinitionsQuerySchema = z.object({
  status: workflowDefinitionStatusSchema.optional(),
  search: z.string().max(255).optional(),
});

export const createWorkflowDefinitionSchema = z.object({
  key: workflowKeySchema,
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  workflowKit: workflowKitDocumentSchema.optional(),
});

export const updateWorkflowDraftWorkflowKitSchema = z.object({
  workflowKit: workflowKitDocumentSchema,
  expectedRevision: z.number().int().positive().optional(),
});

export const idInputSchema = z.object({
  id: uuidSchema,
});

export const validateWorkflowDraftInputSchema = idInputSchema;

export const publishWorkflowDraftInputSchema = idInputSchema.extend({
  expectedRevision: z.number().int().positive().optional(),
});

export const listWorkflowRunsQuerySchema = z.object({
  definitionId: uuidSchema.optional(),
  workflowType: z.string().min(1).max(255).optional(),
  entityType: z.string().min(1).max(255).optional(),
  entityId: uuidSchema.optional(),
  status: workflowRunStatusSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const getWorkflowRunInputSchema = z.object({
  runId: z.string().min(1),
});

export const cancelWorkflowRunInputSchema = getWorkflowRunInputSchema;

export const cancelWorkflowRunResponseSchema = successResponseSchema;

export type WorkflowDefinitionStatus = z.infer<
  typeof workflowDefinitionStatusSchema
>;
export type WorkflowKitDocument = z.infer<typeof workflowKitDocumentSchema>;
export type WorkflowValidationIssueCode = z.infer<
  typeof workflowValidationIssueCodeSchema
>;
export type WorkflowValidationIssue = z.infer<
  typeof workflowValidationIssueSchema
>;
export type WorkflowValidationResult = z.infer<
  typeof workflowValidationResultSchema
>;
export type WorkflowDefinitionSummary = z.infer<
  typeof workflowDefinitionSummarySchema
>;
export type WorkflowDefinitionVersion = z.infer<
  typeof workflowDefinitionVersionSchema
>;
export type WorkflowBinding = z.infer<typeof workflowBindingSchema>;
export type WorkflowDefinitionDetail = z.infer<
  typeof workflowDefinitionDetailSchema
>;
export type WorkflowDefinitionListResponse = z.infer<
  typeof workflowDefinitionListResponseSchema
>;
export type WorkflowRunStatus = z.infer<typeof workflowRunStatusSchema>;
export type WorkflowRunSummary = z.infer<typeof workflowRunSummarySchema>;
export type WorkflowRunDetail = z.infer<typeof workflowRunDetailSchema>;
export type WorkflowRunListResponse = z.infer<
  typeof workflowRunListResponseSchema
>;
export type ListWorkflowDefinitionsQuery = z.infer<
  typeof listWorkflowDefinitionsQuerySchema
>;
export type CreateWorkflowDefinitionInput = z.infer<
  typeof createWorkflowDefinitionSchema
>;
export type UpdateWorkflowDraftWorkflowKitInput = z.infer<
  typeof updateWorkflowDraftWorkflowKitSchema
>;
export type ValidateWorkflowDraftInput = z.infer<
  typeof validateWorkflowDraftInputSchema
>;
export type PublishWorkflowDraftInput = z.infer<
  typeof publishWorkflowDraftInputSchema
>;
export type ListWorkflowRunsQuery = z.infer<typeof listWorkflowRunsQuerySchema>;
export type GetWorkflowRunInput = z.infer<typeof getWorkflowRunInputSchema>;
export type CancelWorkflowRunInput = z.infer<
  typeof cancelWorkflowRunInputSchema
>;
export type CancelWorkflowRunResponse = z.infer<
  typeof cancelWorkflowRunResponseSchema
>;
