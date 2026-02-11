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

const workflowRelativeDurationSchema = z
  .string()
  .regex(
    /^P(?!$)(\d+W|\d+D|T(\d+H)?(\d+M)?(\d+S)?|\d+D(T(\d+H)?(\d+M)?(\d+S)?)?)$/,
    "Duration must be a relative ISO 8601 duration (for example: PT30M, P1D, P3DT2H)",
  );

export const workflowTriggerRetryPolicySchema = z.object({
  attempts: z.number().int().min(1).max(25),
  backoff: z.enum(["none", "fixed", "exponential"]).default("exponential"),
  baseDelay: workflowRelativeDurationSchema.optional(),
  maxDelay: workflowRelativeDurationSchema.optional(),
});

export const workflowTriggerDebouncePolicySchema = z.object({
  enabled: z.boolean().default(false),
  window: workflowRelativeDurationSchema,
  strategy: z.enum(["latest_only", "coalesce"]).default("latest_only"),
});

export const workflowTriggerReplacementPolicySchema = z.object({
  mode: z
    .enum(["replace_active", "cancel_without_replacement", "allow_parallel"])
    .default("replace_active"),
  cancelOnTerminalState: z.boolean().default(true),
});

export const workflowTriggerConfigSchema = z.union([
  z
    .object({
      event: webhookEventTypeSchema,
      retryPolicy: workflowTriggerRetryPolicySchema.optional(),
      debounce: workflowTriggerDebouncePolicySchema.optional(),
      replacement: workflowTriggerReplacementPolicySchema.optional(),
    })
    .loose(),
  z
    .object({
      eventType: webhookEventTypeSchema,
      retryPolicy: workflowTriggerRetryPolicySchema.optional(),
      debounce: workflowTriggerDebouncePolicySchema.optional(),
      replacement: workflowTriggerReplacementPolicySchema.optional(),
    })
    .loose(),
]);

export const workflowGuardConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum([
    "eq",
    "neq",
    "lt",
    "lte",
    "gt",
    "gte",
    "in",
    "not_in",
    "exists",
    "not_exists",
  ]),
  value: z.unknown().optional(),
});

export const workflowGuardSchema = z.object({
  combinator: z.enum(["all", "any"]).default("all"),
  conditions: z.array(workflowGuardConditionSchema).min(1),
});

export const workflowWaitNodeConfigSchema = z.object({
  mode: z.literal("relative").default("relative"),
  duration: workflowRelativeDurationSchema,
  referenceField: z.string().min(1).optional(),
  offsetDirection: z.enum(["before", "after"]).default("after"),
});

export const workflowActionNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("action"),
    actionId: z.string().min(1),
    integrationKey: z.string().min(1),
    input: z.record(z.string(), z.unknown()).default({}),
    guard: workflowGuardSchema.optional(),
  })
  .loose();

export const workflowWaitNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("wait"),
    wait: workflowWaitNodeConfigSchema,
  })
  .loose();

export const workflowTerminalNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("terminal"),
    terminalType: z.enum(["complete", "cancel"]),
  })
  .loose();

export const workflowGraphNodeSchema = z.discriminatedUnion("kind", [
  workflowActionNodeSchema,
  workflowWaitNodeSchema,
  workflowTerminalNodeSchema,
]);

export const workflowGraphEdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    branch: z.enum(["next", "timeout", "true", "false"]).optional(),
  })
  .loose();

export const workflowGraphDocumentSchema = z
  .object({
    schemaVersion: z.number().int().positive().default(1),
    trigger: workflowTriggerConfigSchema.optional(),
    nodes: z.array(workflowGraphNodeSchema).default([]),
    edges: z.array(workflowGraphEdgeSchema).default([]),
  })
  .loose();

// Temporary alias while API/DB naming is migrated from "workflowKit" to first-party graph naming.
export const workflowKitDocumentSchema = workflowGraphDocumentSchema;

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

export const workflowBindingListResponseSchema = z.object({
  items: z.array(workflowBindingSchema),
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

export const listWorkflowBindingsInputSchema = idInputSchema;

export const upsertWorkflowBindingInputSchema = idInputSchema.extend({
  eventType: webhookEventTypeSchema,
  enabled: z.boolean().default(true),
});

export const removeWorkflowBindingInputSchema = idInputSchema.extend({
  eventType: webhookEventTypeSchema,
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
export type WorkflowTriggerRetryPolicy = z.infer<
  typeof workflowTriggerRetryPolicySchema
>;
export type WorkflowTriggerDebouncePolicy = z.infer<
  typeof workflowTriggerDebouncePolicySchema
>;
export type WorkflowTriggerReplacementPolicy = z.infer<
  typeof workflowTriggerReplacementPolicySchema
>;
export type WorkflowTriggerConfig = z.infer<typeof workflowTriggerConfigSchema>;
export type WorkflowGuardCondition = z.infer<
  typeof workflowGuardConditionSchema
>;
export type WorkflowGuard = z.infer<typeof workflowGuardSchema>;
export type WorkflowWaitNodeConfig = z.infer<
  typeof workflowWaitNodeConfigSchema
>;
export type WorkflowActionNode = z.infer<typeof workflowActionNodeSchema>;
export type WorkflowWaitNode = z.infer<typeof workflowWaitNodeSchema>;
export type WorkflowTerminalNode = z.infer<typeof workflowTerminalNodeSchema>;
export type WorkflowGraphNode = z.infer<typeof workflowGraphNodeSchema>;
export type WorkflowGraphEdge = z.infer<typeof workflowGraphEdgeSchema>;
export type WorkflowGraphDocument = z.input<typeof workflowGraphDocumentSchema>;
export type WorkflowKitDocument = z.input<typeof workflowKitDocumentSchema>;
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
export type WorkflowBindingListResponse = z.infer<
  typeof workflowBindingListResponseSchema
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
export type ListWorkflowBindingsInput = z.infer<
  typeof listWorkflowBindingsInputSchema
>;
export type UpsertWorkflowBindingInput = z.infer<
  typeof upsertWorkflowBindingInputSchema
>;
export type RemoveWorkflowBindingInput = z.infer<
  typeof removeWorkflowBindingInputSchema
>;
export type ListWorkflowRunsQuery = z.infer<typeof listWorkflowRunsQuerySchema>;
export type GetWorkflowRunInput = z.infer<typeof getWorkflowRunInputSchema>;
export type CancelWorkflowRunInput = z.infer<
  typeof cancelWorkflowRunInputSchema
>;
export type CancelWorkflowRunResponse = z.infer<
  typeof cancelWorkflowRunResponseSchema
>;
