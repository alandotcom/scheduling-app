import { z } from "zod";
import {
  nonNegativeIntSchema,
  paginationSchema,
  successResponseSchema,
  timestampSchema,
  timestampsSchema,
  uuidSchema,
} from "./common";
import { domainEventTypeSchema } from "./domain-event";
import { serializedWorkflowGraphSchema } from "./workflow-graph";
import { linearJourneyGraphSchema } from "./journey";

export const workflowVisibilitySchema = z.enum(["private", "public"]);

export const workflowSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  name: z.string().trim().min(1).max(255),
  description: z.string().nullable(),
  graph: serializedWorkflowGraphSchema,
  isEnabled: z.boolean(),
  visibility: workflowVisibilitySchema,
  ...timestampsSchema.shape,
});

export const createWorkflowSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Workflow name is required")
    .max(255)
    .optional(),
  description: z.string().trim().max(2000).optional(),
  graph: linearJourneyGraphSchema,
  isEnabled: z.boolean().optional(),
  visibility: workflowVisibilitySchema.optional(),
});

export const updateWorkflowSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Workflow name is required")
      .max(255)
      .optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    graph: linearJourneyGraphSchema.optional(),
    isEnabled: z.boolean().optional(),
    visibility: workflowVisibilitySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const listWorkflowsQuerySchema = paginationSchema;

export const workflowIdParamsSchema = z.object({
  workflowId: uuidSchema,
});

export const workflowExecutionIdParamsSchema = z.object({
  executionId: uuidSchema,
});

export const workflowResponseSchema = workflowSchema.extend({
  isOwner: z.boolean().optional(),
});
export const workflowListResponseSchema = z.array(workflowResponseSchema);

export const workflowExecuteInputSchema = z.object({
  eventType: domainEventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  dryRun: z.boolean().optional(),
});

export const workflowExecutionSampleSchema = z.object({
  eventType: domainEventTypeSchema,
  recordId: uuidSchema,
  label: z.string().trim().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export const workflowExecutionSampleListResponseSchema = z.object({
  samples: z.array(workflowExecutionSampleSchema),
});

export const workflowExecutionStatusSchema = z.enum([
  "pending",
  "running",
  "waiting",
  "success",
  "error",
  "cancelled",
]);

export const workflowExecutionTriggerTypeSchema = z.enum([
  "manual",
  "domain_event",
]);

export const workflowExecutionSchema = z.object({
  id: uuidSchema,
  workflowId: uuidSchema,
  workflowRunId: z.string().nullable(),
  status: workflowExecutionStatusSchema,
  triggerType: workflowExecutionTriggerTypeSchema.nullable(),
  isDryRun: z.boolean(),
  triggerEventType: domainEventTypeSchema.nullable(),
  correlationKey: z.string().nullable(),
  input: z.record(z.string(), z.unknown()).nullish(),
  output: z.unknown().nullish(),
  error: z.string().nullish(),
  startedAt: timestampSchema,
  waitingAt: timestampSchema.nullable(),
  cancelledAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  duration: z.string().nullable(),
});

export const listWorkflowExecutionsQuerySchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
});

export const workflowExecutionListResponseSchema = z.array(
  workflowExecutionSchema,
);

export const workflowExecutionLogStatusSchema = z.enum([
  "pending",
  "running",
  "success",
  "error",
  "cancelled",
]);

export const workflowExecutionLogSchema = z.object({
  id: uuidSchema,
  executionId: uuidSchema,
  nodeId: z.string().trim().min(1),
  nodeName: z.string().trim().min(1),
  nodeType: z.string().trim().min(1),
  status: workflowExecutionLogStatusSchema,
  input: z.unknown().nullish(),
  output: z.unknown().nullish(),
  error: z.string().nullish(),
  startedAt: timestampSchema,
  completedAt: timestampSchema.nullish(),
  duration: z.string().nullish(),
  timestamp: timestampSchema,
});

export const workflowExecutionLogsResponseSchema = z.object({
  execution: workflowExecutionSchema,
  logs: z.array(workflowExecutionLogSchema),
});

export const workflowExecutionEventSchema = z.object({
  id: uuidSchema,
  workflowId: uuidSchema,
  executionId: uuidSchema.nullable(),
  eventType: z.string().trim().min(1),
  message: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  createdAt: timestampSchema,
});

export const workflowExecutionEventsResponseSchema = z.object({
  events: z.array(workflowExecutionEventSchema),
});

export const workflowExecutionNodeStatusSchema = z.object({
  nodeId: z.string().trim().min(1),
  status: workflowExecutionLogStatusSchema,
});

export const workflowExecutionStatusResponseSchema = z.object({
  status: workflowExecutionStatusSchema,
  nodeStatuses: z.array(workflowExecutionNodeStatusSchema),
});

export const workflowExecutionCancelResponseSchema =
  successResponseSchema.extend({
    status: z.literal("cancelled"),
    cancelledWaitStates: nonNegativeIntSchema,
  });

export const workflowExecutionIgnoredReasonSchema = z.enum([
  "missing_event_type",
  "event_not_configured",
  "no_waiting_runs",
  "duplicate_event",
]);

export const workflowExecutionRunningResponseSchema = z.object({
  status: z.literal("running"),
  executionId: uuidSchema,
  runId: z.string().optional(),
  dryRun: z.boolean(),
  cancelledExecutions: nonNegativeIntSchema.optional(),
  cancelledWaits: nonNegativeIntSchema.optional(),
  simulated: z.boolean().optional(),
});

export const workflowExecutionCancelledResponseSchema = z.object({
  status: z.literal("cancelled"),
  executionId: uuidSchema.optional(),
  dryRun: z.boolean(),
  cancelledExecutions: nonNegativeIntSchema,
  cancelledWaits: nonNegativeIntSchema,
  simulated: z.boolean().optional(),
  failedExecutions: z.array(uuidSchema).optional(),
});

export const workflowExecutionIgnoredResponseSchema = z.object({
  status: z.literal("ignored"),
  executionId: uuidSchema.optional(),
  dryRun: z.boolean().optional(),
  reason: workflowExecutionIgnoredReasonSchema,
  eventType: domainEventTypeSchema.optional(),
});

export const workflowExecuteResponseSchema = z.union([
  workflowExecutionRunningResponseSchema,
  workflowExecutionCancelledResponseSchema.extend({
    executionId: uuidSchema,
  }),
  workflowExecutionIgnoredResponseSchema.extend({
    executionId: uuidSchema,
    dryRun: z.boolean(),
  }),
]);

export const workflowTriggerExecutionResponseSchema = z.discriminatedUnion(
  "status",
  [
    workflowExecutionRunningResponseSchema,
    workflowExecutionCancelledResponseSchema,
    workflowExecutionIgnoredResponseSchema,
  ],
);

export type WorkflowVisibility = z.infer<typeof workflowVisibilitySchema>;
export type Workflow = z.infer<typeof workflowSchema>;
export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type ListWorkflowsQuery = z.infer<typeof listWorkflowsQuerySchema>;
export type WorkflowResponse = z.infer<typeof workflowResponseSchema>;
export type WorkflowListResponse = z.infer<typeof workflowListResponseSchema>;
export type WorkflowExecuteInput = z.infer<typeof workflowExecuteInputSchema>;
export type WorkflowExecutionSample = z.infer<
  typeof workflowExecutionSampleSchema
>;
export type WorkflowExecutionSampleListResponse = z.infer<
  typeof workflowExecutionSampleListResponseSchema
>;
export type WorkflowExecutionStatus = z.infer<
  typeof workflowExecutionStatusSchema
>;
export type WorkflowExecutionTriggerType = z.infer<
  typeof workflowExecutionTriggerTypeSchema
>;
export type WorkflowExecution = z.infer<typeof workflowExecutionSchema>;
export type ListWorkflowExecutionsQuery = z.infer<
  typeof listWorkflowExecutionsQuerySchema
>;
export type WorkflowExecutionListResponse = z.infer<
  typeof workflowExecutionListResponseSchema
>;
export type WorkflowExecutionLogStatus = z.infer<
  typeof workflowExecutionLogStatusSchema
>;
export type WorkflowExecutionLog = z.infer<typeof workflowExecutionLogSchema>;
export type WorkflowExecutionLogsResponse = z.infer<
  typeof workflowExecutionLogsResponseSchema
>;
export type WorkflowExecutionEvent = z.infer<
  typeof workflowExecutionEventSchema
>;
export type WorkflowExecutionEventsResponse = z.infer<
  typeof workflowExecutionEventsResponseSchema
>;
export type WorkflowExecutionNodeStatus = z.infer<
  typeof workflowExecutionNodeStatusSchema
>;
export type WorkflowExecutionStatusResponse = z.infer<
  typeof workflowExecutionStatusResponseSchema
>;
export type WorkflowExecutionCancelResponse = z.infer<
  typeof workflowExecutionCancelResponseSchema
>;
export type WorkflowExecutionIgnoredReason = z.infer<
  typeof workflowExecutionIgnoredReasonSchema
>;
export type WorkflowExecutionRunningResponse = z.infer<
  typeof workflowExecutionRunningResponseSchema
>;
export type WorkflowExecutionCancelledResponse = z.infer<
  typeof workflowExecutionCancelledResponseSchema
>;
export type WorkflowExecutionIgnoredResponse = z.infer<
  typeof workflowExecutionIgnoredResponseSchema
>;
export type WorkflowExecuteResponse = z.infer<
  typeof workflowExecuteResponseSchema
>;
export type WorkflowTriggerExecutionResponse = z.infer<
  typeof workflowTriggerExecutionResponseSchema
>;
