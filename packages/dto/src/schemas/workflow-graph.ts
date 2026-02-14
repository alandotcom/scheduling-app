import { z } from "zod";
import { domainEventTypeSchema } from "./domain-event";

export const workflowNodeTypeSchema = z.enum(["trigger", "action", "add"]);
export const workflowNodeRuntimeStatusSchema = z.enum([
  "idle",
  "running",
  "success",
  "error",
  "cancelled",
]);

function normalizeDomainEventRoutingSet(value: unknown) {
  if (value === undefined || value === null) {
    return [];
  }

  if (typeof value !== "string") {
    return value;
  }

  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return [...new Set(parsed)];
}

export const workflowDomainEventRoutingSetSchema = z.preprocess(
  normalizeDomainEventRoutingSet,
  z.array(domainEventTypeSchema),
);

export const workflowDomainEventTriggerConfigSchema = z
  .object({
    triggerType: z.literal("DomainEvent"),
    startEvents: workflowDomainEventRoutingSetSchema,
    restartEvents: workflowDomainEventRoutingSetSchema,
    stopEvents: workflowDomainEventRoutingSetSchema,
    domainEventCorrelationPath: z.string().trim().min(1).optional(),
    domainEventMockEvent: z.string().trim().min(1).optional(),
  })
  .strict();

export const workflowScheduleTriggerConfigSchema = z
  .object({
    triggerType: z.literal("Schedule"),
    scheduleExpression: z.string().optional(),
    scheduleCron: z.string().optional(),
    scheduleTimezone: z.string().optional(),
  })
  .strict();

export const workflowCustomTriggerConfigSchema = z
  .object({
    triggerType: z.string().trim().min(1),
  })
  .catchall(z.unknown())
  .refine(
    (value) =>
      value.triggerType !== "DomainEvent" && value.triggerType !== "Schedule",
    {
      message: 'Custom triggerType must not be "DomainEvent" or "Schedule"',
      path: ["triggerType"],
    },
  );

export const workflowTriggerConfigSchema = z.union([
  workflowDomainEventTriggerConfigSchema,
  workflowScheduleTriggerConfigSchema,
  workflowCustomTriggerConfigSchema,
]);

const workflowNodeDataBaseSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
  status: workflowNodeRuntimeStatusSchema.optional(),
  enabled: z.boolean().optional(),
});

const workflowTriggerNodeDataSchema = workflowNodeDataBaseSchema
  .extend({
    type: z.literal("trigger"),
    config: workflowTriggerConfigSchema.optional(),
  })
  .loose();

const workflowNonTriggerNodeDataSchema = workflowNodeDataBaseSchema
  .extend({
    type: z.enum(["action", "add"]),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

export const workflowNodeDataSchema = z.discriminatedUnion("type", [
  workflowTriggerNodeDataSchema,
  workflowNonTriggerNodeDataSchema,
]);

export const workflowNodeAttributesSchema = z
  .object({
    id: z.string().trim().min(1),
    type: z.string().optional(),
    position: z
      .object({
        x: z.number(),
        y: z.number(),
      })
      .optional(),
    data: workflowNodeDataSchema,
  })
  .loose();

export const workflowEdgeAttributesSchema = z
  .object({
    id: z.string().trim().min(1),
    source: z.string().trim().min(1),
    target: z.string().trim().min(1),
  })
  .loose();

export const serializedWorkflowNodeSchema = z
  .object({
    key: z.string().trim().min(1),
    attributes: workflowNodeAttributesSchema,
  })
  .strict();

export const serializedWorkflowEdgeSchema = z
  .object({
    key: z.string().trim().min(1),
    source: z.string().trim().min(1),
    target: z.string().trim().min(1),
    attributes: workflowEdgeAttributesSchema,
    undirected: z.literal(false).optional(),
  })
  .strict();

export const serializedWorkflowGraphSchema = z
  .object({
    attributes: z.record(z.string(), z.unknown()).optional(),
    options: z
      .object({
        allowSelfLoops: z.boolean().optional(),
        multi: z.boolean().optional(),
        type: z.enum(["directed", "undirected", "mixed"]).optional(),
      })
      .optional(),
    nodes: z.array(serializedWorkflowNodeSchema),
    edges: z.array(serializedWorkflowEdgeSchema),
  })
  .strict();

export type WorkflowNodeType = z.infer<typeof workflowNodeTypeSchema>;
export type WorkflowNodeRuntimeStatus = z.infer<
  typeof workflowNodeRuntimeStatusSchema
>;
export type WorkflowDomainEventTriggerConfig = z.infer<
  typeof workflowDomainEventTriggerConfigSchema
>;
export type WorkflowScheduleTriggerConfig = z.infer<
  typeof workflowScheduleTriggerConfigSchema
>;
export type WorkflowCustomTriggerConfig = z.infer<
  typeof workflowCustomTriggerConfigSchema
>;
export type WorkflowTriggerConfig = z.infer<typeof workflowTriggerConfigSchema>;
export type WorkflowNodeData = z.infer<typeof workflowNodeDataSchema>;
export type WorkflowNodeAttributes = z.infer<
  typeof workflowNodeAttributesSchema
>;
export type WorkflowEdgeAttributes = z.infer<
  typeof workflowEdgeAttributesSchema
>;
export type SerializedWorkflowNode = z.infer<
  typeof serializedWorkflowNodeSchema
>;
export type SerializedWorkflowEdge = z.infer<
  typeof serializedWorkflowEdgeSchema
>;
export type SerializedWorkflowGraph = z.infer<
  typeof serializedWorkflowGraphSchema
>;
