import { z } from "zod";
import {
  domainEventDomainSchema,
  domainEventTypeSchema,
  getDomainForDomainEventType,
  type DomainEventType,
} from "./domain-event";
import { appIntegrationKeySchema } from "./integration";
import {
  successResponseSchema,
  timestampSchema,
  timestampsSchema,
  uuidSchema,
} from "./common";

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

export const workflowReplacementModeSchema = z.enum([
  "replace_active",
  "cancel_without_replacement",
  "allow_parallel",
]);

function hasIntersection<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.some((entry) => right.includes(entry));
}

export const workflowDomainEventTriggerConfigSchema = z
  .object({
    type: z.literal("domain_event"),
    domain: domainEventDomainSchema,
    startEvents: z.array(domainEventTypeSchema).default([]),
    restartEvents: z.array(domainEventTypeSchema).default([]),
    stopEvents: z.array(domainEventTypeSchema).default([]),
    retryPolicy: workflowTriggerRetryPolicySchema.optional(),
    debounce: workflowTriggerDebouncePolicySchema.optional(),
    replacement: workflowTriggerReplacementPolicySchema.optional(),
  })
  .loose()
  .superRefine((value, ctx) => {
    const events = [
      ...value.startEvents,
      ...value.restartEvents,
      ...value.stopEvents,
    ];

    if (events.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["startEvents"],
        message:
          "Select at least one domain event across start, restart, or stop sets",
      });
    }

    const mismatchedDomainEvents = events.filter(
      (eventType) => getDomainForDomainEventType(eventType) !== value.domain,
    );

    if (mismatchedDomainEvents.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["domain"],
        message: `All events must belong to the "${value.domain}" domain`,
      });
    }

    if (hasIntersection(value.startEvents, value.restartEvents)) {
      ctx.addIssue({
        code: "custom",
        path: ["restartEvents"],
        message: "Start and restart event sets must not overlap",
      });
    }

    if (hasIntersection(value.startEvents, value.stopEvents)) {
      ctx.addIssue({
        code: "custom",
        path: ["stopEvents"],
        message: "Start and stop event sets must not overlap",
      });
    }

    if (hasIntersection(value.restartEvents, value.stopEvents)) {
      ctx.addIssue({
        code: "custom",
        path: ["stopEvents"],
        message: "Restart and stop event sets must not overlap",
      });
    }
  });

export const workflowScheduleTriggerConfigSchema = z
  .object({
    type: z.literal("schedule"),
    expression: z.string().trim().min(1),
    timezone: z.string().trim().min(1),
    retryPolicy: workflowTriggerRetryPolicySchema.optional(),
    replacement: workflowTriggerReplacementPolicySchema
      .optional()
      .default({ mode: "allow_parallel", cancelOnTerminalState: false }),
  })
  .loose();

export const workflowTriggerConfigSchema = z.union([
  workflowDomainEventTriggerConfigSchema,
  workflowScheduleTriggerConfigSchema,
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

export const workflowConditionNodeSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("condition"),
    guard: workflowGuardSchema,
  })
  .loose();

export const workflowGraphNodeSchema = z.discriminatedUnion("kind", [
  workflowActionNodeSchema,
  workflowWaitNodeSchema,
  workflowConditionNodeSchema,
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

export const workflowValidationIssueCodeSchema = z.enum([
  "MISSING_REQUIRED_FIELD",
  "BROKEN_REFERENCE",
  "INVALID_EDGE",
  "CYCLE_DETECTED",
  "UNREACHABLE_NODE",
  "INVALID_EXPRESSION",
  "UNKNOWN_ACTION",
  "INTEGRATION_NOT_CONFIGURED",
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
  workflowGraphSchemaVersion: z.number().int().positive(),
  workflowGraph: workflowGraphDocumentSchema,
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
  eventType: domainEventTypeSchema,
  enabled: z.boolean(),
  ...timestampsSchema.shape,
});

export const workflowScheduleBindingSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  definitionId: uuidSchema,
  versionId: uuidSchema,
  scheduleExpression: z.string().min(1),
  scheduleTimezone: z.string().min(1),
  nextRunAt: timestampSchema.nullable(),
  enabled: z.boolean(),
  ...timestampsSchema.shape,
});

export const workflowDefinitionDetailSchema =
  workflowDefinitionSummarySchema.extend({
    draftWorkflowGraph: workflowGraphDocumentSchema,
    activeVersion: workflowDefinitionVersionSchema.nullable(),
    bindings: z.array(workflowBindingSchema),
    scheduleBindings: z.array(workflowScheduleBindingSchema).default([]),
  });

export const workflowDefinitionListResponseSchema = z.object({
  items: z.array(workflowDefinitionSummarySchema),
});

export const workflowBindingListResponseSchema = z.object({
  items: z.array(workflowBindingSchema),
  schedules: z.array(workflowScheduleBindingSchema).default([]),
});

export const workflowDomainTriggerCatalogItemSchema = z.object({
  type: z.literal("domain_event"),
  domain: domainEventDomainSchema,
  events: z.array(domainEventTypeSchema).min(1),
  defaultStartEvents: z.array(domainEventTypeSchema).default([]),
  defaultRestartEvents: z.array(domainEventTypeSchema).default([]),
  defaultStopEvents: z.array(domainEventTypeSchema).default([]),
});

export const workflowScheduleTriggerCatalogItemSchema = z.object({
  type: z.literal("schedule"),
  label: z.string().default("Schedule"),
  defaultTimezone: z.string().default("America/New_York"),
});

export const workflowTriggerCatalogItemSchema = z.discriminatedUnion("type", [
  workflowDomainTriggerCatalogItemSchema,
  workflowScheduleTriggerCatalogItemSchema,
]);

// ---------------------------------------------------------------------------
// Template / Declarative Config Schemas
// ---------------------------------------------------------------------------

export const workflowOutputFieldSchema = z.object({
  field: z.string().min(1),
  description: z.string(),
});

export const workflowSelectOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

const workflowActionConfigFieldTypeSchema = z.enum([
  "template-input",
  "template-textarea",
  "text",
  "number",
  "select",
]);

export const workflowActionConfigFieldBaseSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: workflowActionConfigFieldTypeSchema,
  placeholder: z.string().optional(),
  defaultValue: z.union([z.string(), z.number()]).optional(),
  options: z.array(workflowSelectOptionSchema).optional(),
  rows: z.number().int().positive().optional(),
  required: z.boolean().optional(),
  showWhen: z
    .object({ field: z.string().min(1), equals: z.string() })
    .optional(),
});

export const workflowActionConfigFieldGroupSchema = z.object({
  type: z.literal("group"),
  label: z.string().min(1),
  fields: z.array(workflowActionConfigFieldBaseSchema).min(1),
  defaultExpanded: z.boolean().optional(),
});

export const workflowActionConfigFieldSchema = z.union([
  workflowActionConfigFieldBaseSchema,
  workflowActionConfigFieldGroupSchema,
]);

// ---------------------------------------------------------------------------
// Catalog Schemas
// ---------------------------------------------------------------------------

export const workflowActionCatalogItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  requiresIntegration: z
    .object({
      key: appIntegrationKeySchema,
      mode: z
        .literal("enabled_and_configured")
        .default("enabled_and_configured"),
    })
    .optional(),
  configFields: z.array(workflowActionConfigFieldSchema).optional(),
  outputFields: z.array(workflowOutputFieldSchema).optional(),
});

export const workflowCatalogResponseSchema = z.object({
  triggers: z.array(workflowTriggerCatalogItemSchema),
  actions: z.array(workflowActionCatalogItemSchema),
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
  workflowGraph: workflowGraphDocumentSchema.optional(),
});

export const updateWorkflowDraftWorkflowGraphSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  workflowGraph: workflowGraphDocumentSchema,
  expectedRevision: z.number().int().positive().optional(),
});

export const idInputSchema = z.object({
  id: uuidSchema,
});

export const validateWorkflowDraftInputSchema = idInputSchema;

export const publishWorkflowDraftInputSchema = idInputSchema.extend({
  expectedRevision: z.number().int().positive().optional(),
});

export const runWorkflowDraftInputSchema = idInputSchema.extend({
  entityType: z.enum([
    "appointment",
    "calendar",
    "appointment_type",
    "resource",
    "location",
    "client",
    "workflow",
  ]),
  entityId: uuidSchema,
});

export const runWorkflowDraftResponseSchema = z.object({
  success: z.literal(true),
  triggerEventId: z.string().min(1),
});

export const listWorkflowBindingsInputSchema = idInputSchema;

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

// ---------------------------------------------------------------------------
// Step Log Schemas
// ---------------------------------------------------------------------------

export const workflowStepLogStatusSchema = z.enum([
  "pending",
  "running",
  "success",
  "error",
  "skipped",
]);

export const workflowStepLogEntrySchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  runId: z.string().min(1),
  nodeId: z.string().min(1),
  nodeName: z.string(),
  nodeType: z.string().min(1),
  status: workflowStepLogStatusSchema,
  input: z.record(z.string(), z.unknown()).nullable(),
  output: z.record(z.string(), z.unknown()).nullable(),
  errorMessage: z.string().nullable(),
  startedAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  durationMs: z.number().int().nullable(),
  ...timestampsSchema.shape,
});

export const listWorkflowStepLogsInputSchema = z.object({
  runId: z.string().min(1),
});

export const workflowStepLogListResponseSchema = z.object({
  items: z.array(workflowStepLogEntrySchema),
});

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
export type WorkflowReplacementMode = z.infer<
  typeof workflowReplacementModeSchema
>;
export type WorkflowDomainEventTriggerConfig = z.infer<
  typeof workflowDomainEventTriggerConfigSchema
>;
export type WorkflowScheduleTriggerConfig = z.infer<
  typeof workflowScheduleTriggerConfigSchema
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
export type WorkflowGraphNode = z.infer<typeof workflowGraphNodeSchema>;
export type WorkflowGraphEdge = z.infer<typeof workflowGraphEdgeSchema>;
export type WorkflowGraphDocument = z.input<typeof workflowGraphDocumentSchema>;
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
export type WorkflowScheduleBinding = z.infer<
  typeof workflowScheduleBindingSchema
>;
export type WorkflowDefinitionDetail = z.infer<
  typeof workflowDefinitionDetailSchema
>;
export type WorkflowDefinitionListResponse = z.infer<
  typeof workflowDefinitionListResponseSchema
>;
export type WorkflowBindingListResponse = z.infer<
  typeof workflowBindingListResponseSchema
>;
export type WorkflowTriggerCatalogItem = z.infer<
  typeof workflowTriggerCatalogItemSchema
>;
export type WorkflowOutputField = z.infer<typeof workflowOutputFieldSchema>;
export type WorkflowActionConfigField = z.infer<
  typeof workflowActionConfigFieldSchema
>;
export type WorkflowActionCatalogItem = z.infer<
  typeof workflowActionCatalogItemSchema
>;
export type WorkflowCatalogResponse = z.infer<
  typeof workflowCatalogResponseSchema
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
export type UpdateWorkflowDraftWorkflowGraphInput = z.infer<
  typeof updateWorkflowDraftWorkflowGraphSchema
>;
export type ValidateWorkflowDraftInput = z.infer<
  typeof validateWorkflowDraftInputSchema
>;
export type PublishWorkflowDraftInput = z.infer<
  typeof publishWorkflowDraftInputSchema
>;
export type RunWorkflowDraftInput = z.infer<typeof runWorkflowDraftInputSchema>;
export type RunWorkflowDraftResponse = z.infer<
  typeof runWorkflowDraftResponseSchema
>;
export type ListWorkflowBindingsInput = z.infer<
  typeof listWorkflowBindingsInputSchema
>;
export type ListWorkflowRunsQuery = z.infer<typeof listWorkflowRunsQuerySchema>;
export type GetWorkflowRunInput = z.infer<typeof getWorkflowRunInputSchema>;
export type CancelWorkflowRunInput = z.infer<
  typeof cancelWorkflowRunInputSchema
>;
export type WorkflowStepLogStatus = z.infer<typeof workflowStepLogStatusSchema>;
export type WorkflowStepLogEntry = z.infer<typeof workflowStepLogEntrySchema>;
export type ListWorkflowStepLogsInput = z.infer<
  typeof listWorkflowStepLogsInputSchema
>;
export type WorkflowStepLogListResponse = z.infer<
  typeof workflowStepLogListResponseSchema
>;

// Local helper schema export for non-workflow packages that need parsing.
export { workflowRelativeDurationSchema };
export { domainEventTypeSchema, type DomainEventType };
