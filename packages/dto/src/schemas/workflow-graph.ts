import { z } from "zod";
import {
  domainEventDomainSchema,
  domainEventTypeSchema,
  getDomainForDomainEventType,
} from "./domain-event";

export const workflowNodeTypeSchema = z.enum(["trigger", "action"]);
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

const FILTER_FIELD_PATTERN =
  /^(appointment|client)\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$/;
const MAX_TRIGGER_FILTER_GROUPS = 4;
const MAX_TRIGGER_FILTER_CONDITIONS = 12;

const TEMPORAL_FILTER_OPERATOR_SET = new Set([
  "before",
  "after",
  "on_or_before",
  "on_or_after",
  "within_next",
  "more_than_from_now",
  "less_than_ago",
  "more_than_ago",
]);

const STRING_FILTER_OPERATOR_SET = new Set([
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
]);

export const journeyTriggerFilterOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "in",
  "not_in",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "before",
  "after",
  "on_or_before",
  "on_or_after",
  "within_next",
  "more_than_from_now",
  "less_than_ago",
  "more_than_ago",
  "is_set",
  "is_not_set",
]);

export const journeyTriggerFilterTemporalUnitSchema = z.enum([
  "minutes",
  "hours",
  "days",
  "weeks",
]);

function isPrimitiveLiteral(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isIsoDateTimeLiteral(value: unknown): boolean {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function isRelativeTemporalValue(
  value: unknown,
): value is { amount: number; unit: "minutes" | "hours" | "days" | "weeks" } {
  const parsed = z
    .object({
      amount: z.number().int().positive(),
      unit: journeyTriggerFilterTemporalUnitSchema,
    })
    .safeParse(value);

  return parsed.success;
}

type JourneyTriggerFilterFieldKind = "temporal" | "text" | "generic";

function classifyJourneyTriggerFilterField(
  fieldPath: string,
): JourneyTriggerFilterFieldKind {
  const normalizedFieldPath = fieldPath.toLowerCase();

  if (
    normalizedFieldPath.endsWith("at") ||
    normalizedFieldPath.endsWith("date") ||
    normalizedFieldPath.endsWith("datetime")
  ) {
    return "temporal";
  }

  if (
    normalizedFieldPath.endsWith("id") ||
    normalizedFieldPath.endsWith("email") ||
    normalizedFieldPath.endsWith("name") ||
    normalizedFieldPath.endsWith("phone") ||
    normalizedFieldPath.endsWith("timezone") ||
    normalizedFieldPath.endsWith("status")
  ) {
    return "text";
  }

  return "generic";
}

export const journeyTriggerFilterConditionSchema = z
  .object({
    field: z.string().trim().regex(FILTER_FIELD_PATTERN, {
      message: 'Filter fields must be rooted under "appointment" or "client"',
    }),
    operator: journeyTriggerFilterOperatorSchema,
    value: z.unknown().optional(),
    timezone: z.string().trim().min(1).optional(),
    not: z.boolean().optional(),
  })
  .strict()
  .superRefine((condition, ctx) => {
    const hasValue = condition.value !== undefined;
    const fieldKind = classifyJourneyTriggerFilterField(condition.field);

    if (
      STRING_FILTER_OPERATOR_SET.has(condition.operator) &&
      fieldKind === "temporal"
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "String operators cannot be used with temporal fields; use date/time operators instead",
        path: ["operator"],
      });
    }

    if (
      TEMPORAL_FILTER_OPERATOR_SET.has(condition.operator) &&
      fieldKind !== "temporal"
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Date/time operators can only be used with temporal fields",
        path: ["operator"],
      });
    }

    const isAbsoluteTemporalOperator =
      condition.operator === "before" ||
      condition.operator === "after" ||
      condition.operator === "on_or_before" ||
      condition.operator === "on_or_after";

    if (condition.timezone !== undefined && !isAbsoluteTemporalOperator) {
      ctx.addIssue({
        code: "custom",
        message: "Timezone is only supported for absolute date operators",
        path: ["timezone"],
      });
    }

    switch (condition.operator) {
      case "is_set":
      case "is_not_set": {
        if (hasValue) {
          ctx.addIssue({
            code: "custom",
            message: 'Operator "is_set" and "is_not_set" do not accept a value',
            path: ["value"],
          });
        }
        return;
      }

      case "equals":
      case "not_equals": {
        if (!hasValue || !isPrimitiveLiteral(condition.value)) {
          ctx.addIssue({
            code: "custom",
            message:
              'Operator "equals" and "not_equals" require a primitive value',
            path: ["value"],
          });
        }
        return;
      }

      case "in":
      case "not_in": {
        const values = condition.value;
        if (
          !Array.isArray(values) ||
          values.length === 0 ||
          values.some((item) => !isPrimitiveLiteral(item))
        ) {
          ctx.addIssue({
            code: "custom",
            message:
              'Operator "in" and "not_in" require a non-empty primitive list value',
            path: ["value"],
          });
        }
        return;
      }

      case "contains":
      case "not_contains":
      case "starts_with":
      case "ends_with": {
        if (
          typeof condition.value !== "string" ||
          condition.value.length === 0
        ) {
          ctx.addIssue({
            code: "custom",
            message:
              "String operators require a non-empty string comparison value",
            path: ["value"],
          });
        }
        return;
      }

      case "before":
      case "after":
      case "on_or_before":
      case "on_or_after": {
        if (!isIsoDateTimeLiteral(condition.value)) {
          ctx.addIssue({
            code: "custom",
            message: "Date operators require an ISO-compatible date-time value",
            path: ["value"],
          });
        }
        return;
      }

      case "within_next":
      case "more_than_from_now":
      case "less_than_ago":
      case "more_than_ago": {
        if (!isRelativeTemporalValue(condition.value)) {
          ctx.addIssue({
            code: "custom",
            message:
              "Relative date operators require { amount: positive integer, unit: minutes|hours|days|weeks }",
            path: ["value"],
          });
        }
      }
    }
  });

export const journeyTriggerFilterGroupSchema = z
  .object({
    logic: z.enum(["and", "or"]),
    not: z.boolean().optional(),
    conditions: z.array(journeyTriggerFilterConditionSchema).min(1),
  })
  .strict();

export const journeyTriggerFilterAstSchema = z
  .object({
    logic: z.enum(["and", "or"]).default("and"),
    groups: z
      .array(journeyTriggerFilterGroupSchema)
      .min(1)
      .max(MAX_TRIGGER_FILTER_GROUPS),
  })
  .strict()
  .superRefine((ast, ctx) => {
    const totalConditions = ast.groups.reduce(
      (total, group) => total + group.conditions.length,
      0,
    );

    if (totalConditions > MAX_TRIGGER_FILTER_CONDITIONS) {
      ctx.addIssue({
        code: "custom",
        message: `Trigger filters cannot contain more than ${MAX_TRIGGER_FILTER_CONDITIONS} conditions`,
        path: ["groups"],
      });
    }
  });

export const appointmentJourneyTriggerConfigSchema = z
  .object({
    triggerType: z.literal("AppointmentJourney"),
    start: z.literal("appointment.scheduled"),
    restart: z.literal("appointment.rescheduled"),
    stop: z.literal("appointment.canceled"),
    correlationKey: z.literal("appointmentId"),
    filter: journeyTriggerFilterAstSchema.optional(),
  })
  .strict();

export const clientJourneyTriggerConfigSchema = z
  .object({
    triggerType: z.literal("ClientJourney"),
    event: z.enum(["client.created", "client.updated"]),
    correlationKey: z.literal("clientId"),
    trackedAttributeKey: z.string().trim().min(1).optional(),
    filter: journeyTriggerFilterAstSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.event === "client.updated" && !value.trackedAttributeKey) {
      ctx.addIssue({
        code: "custom",
        message: 'Client updated triggers must include "trackedAttributeKey".',
        path: ["trackedAttributeKey"],
      });
    }
  })
  .strict();

export const journeyTriggerConfigSchema = z.discriminatedUnion("triggerType", [
  appointmentJourneyTriggerConfigSchema,
  clientJourneyTriggerConfigSchema,
]);

const workflowDomainEventTriggerConfigSchema = z
  .object({
    triggerType: z.literal("DomainEvent"),
    domain: domainEventDomainSchema,
    startEvents: workflowDomainEventRoutingSetSchema,
    restartEvents: workflowDomainEventRoutingSetSchema,
    stopEvents: workflowDomainEventRoutingSetSchema,
    filter: journeyTriggerFilterAstSchema.optional(),
    domainEventCorrelationPath: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const routingSets = [
      { key: "startEvents", values: value.startEvents },
      { key: "restartEvents", values: value.restartEvents },
      { key: "stopEvents", values: value.stopEvents },
    ] as const;

    for (const set of routingSets) {
      for (const [index, eventType] of set.values.entries()) {
        if (getDomainForDomainEventType(eventType) === value.domain) {
          continue;
        }

        ctx.addIssue({
          code: "custom",
          message: `Event "${eventType}" does not match selected domain "${value.domain}"`,
          path: [set.key, index],
        });
      }
    }
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
      value.triggerType !== "DomainEvent" &&
      value.triggerType !== "Schedule" &&
      value.triggerType !== "AppointmentJourney" &&
      value.triggerType !== "ClientJourney",
    {
      message:
        'Custom triggerType must not be "DomainEvent", "Schedule", "AppointmentJourney", or "ClientJourney"',
      path: ["triggerType"],
    },
  );

export const workflowTriggerConfigSchema = z.union([
  journeyTriggerConfigSchema,
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
    type: z.literal("action"),
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

const serializedWorkflowGraphSchema = z
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
export type AppointmentJourneyTriggerConfig = z.infer<
  typeof appointmentJourneyTriggerConfigSchema
>;
export type ClientJourneyTriggerConfig = z.infer<
  typeof clientJourneyTriggerConfigSchema
>;
export type JourneyTriggerConfig = z.infer<typeof journeyTriggerConfigSchema>;
export type JourneyTriggerFilterOperator = z.infer<
  typeof journeyTriggerFilterOperatorSchema
>;
export type JourneyTriggerFilterTemporalUnit = z.infer<
  typeof journeyTriggerFilterTemporalUnitSchema
>;
export type JourneyTriggerFilterCondition = z.infer<
  typeof journeyTriggerFilterConditionSchema
>;
export type JourneyTriggerFilterGroup = z.infer<
  typeof journeyTriggerFilterGroupSchema
>;
export type JourneyTriggerFilterAst = z.infer<
  typeof journeyTriggerFilterAstSchema
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
export type SerializedJourneyGraph = SerializedWorkflowGraph;

export const serializedJourneyGraphSchema = serializedWorkflowGraphSchema;
