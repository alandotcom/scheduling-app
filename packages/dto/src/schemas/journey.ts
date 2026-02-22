import { z } from "zod";
import {
  nonNegativeIntSchema,
  positiveIntSchema,
  successResponseSchema,
  timestampSchema,
  timestampsSchema,
  uuidSchema,
} from "./common";
import {
  journeyTriggerConfigSchema,
  serializedJourneyGraphSchema,
} from "./workflow-graph";

export const journeyStatusSchema = z.enum(["draft", "published", "paused"]);

export const journeyModeSchema = z.enum(["live", "test"]);
export const journeyPublishModeSchema = journeyModeSchema;
export const setJourneyModeSchema = z.object({
  mode: journeyModeSchema,
});
export const journeyRunModeSchema = journeyModeSchema;
export const journeyRunStatusSchema = z.enum([
  "planned",
  "running",
  "completed",
  "canceled",
  "failed",
]);
export const journeyDeliveryStatusSchema = z.enum([
  "planned",
  "sent",
  "failed",
  "canceled",
  "skipped",
]);
export const journeyRunStepLogStatusSchema = z.enum([
  "pending",
  "running",
  "success",
  "error",
  "cancelled",
]);
export const journeyDeliveryReasonCodeSchema = z
  .string()
  .trim()
  .min(1)
  .nullable();

const supportedJourneyActionTypeSchema = z.enum([
  "wait",
  "wait-for-confirmation",
  "send-resend",
  "send-resend-template",
  "send-slack",
  "send-twilio",
  "condition",
  "logger",
]);

type JourneyGraphNode = z.infer<
  typeof serializedJourneyGraphSchema
>["nodes"][number];
type JourneyGraphEdge = z.infer<
  typeof serializedJourneyGraphSchema
>["edges"][number];
type ConditionBranch = "true" | "false";
type TriggerBranch = "scheduled" | "canceled";

function normalizeJourneyActionType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getConditionExpression(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const expression = value["expression"];
  if (typeof expression !== "string" || expression.trim().length === 0) {
    return null;
  }

  return expression;
}

function normalizeConditionBranch(value: unknown): ConditionBranch | null {
  if (typeof value !== "string") {
    return null;
  }

  let normalized = value.trim().toLowerCase();
  if (normalized.startsWith("branch-")) {
    normalized = normalized.slice("branch-".length);
  }

  if (normalized === "true" || normalized === "false") {
    return normalized;
  }

  return null;
}

function normalizeTriggerBranch(value: unknown): TriggerBranch | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "scheduled" || normalized === "canceled") {
    return normalized;
  }

  return null;
}

function getConditionBranchFromEdge(
  edge: JourneyGraphEdge,
): ConditionBranch | null {
  const attributes: Record<string, unknown> = isRecord(edge.attributes)
    ? edge.attributes
    : {};
  const data: Record<string, unknown> = isRecord(attributes["data"])
    ? attributes["data"]
    : {};

  const dataBranch = normalizeConditionBranch(data["conditionBranch"]);
  if (dataBranch) {
    return dataBranch;
  }

  const labelBranch = normalizeConditionBranch(attributes["label"]);
  if (labelBranch) {
    return labelBranch;
  }

  const sourceHandleBranch = normalizeConditionBranch(
    attributes["sourceHandle"],
  );
  if (sourceHandleBranch) {
    return sourceHandleBranch;
  }

  return null;
}

function getTriggerBranchFromEdge(
  edge: JourneyGraphEdge,
): TriggerBranch | null {
  const attributes: Record<string, unknown> = isRecord(edge.attributes)
    ? edge.attributes
    : {};
  const data: Record<string, unknown> = isRecord(attributes["data"])
    ? attributes["data"]
    : {};

  const dataBranch = normalizeTriggerBranch(data["triggerBranch"]);
  if (dataBranch) {
    return dataBranch;
  }

  const labelBranch = normalizeTriggerBranch(attributes["label"]);
  if (labelBranch) {
    return labelBranch;
  }

  const sourceHandleBranch = normalizeTriggerBranch(attributes["sourceHandle"]);
  if (sourceHandleBranch) {
    return sourceHandleBranch;
  }

  return null;
}

export const linearJourneyGraphSchema =
  serializedJourneyGraphSchema.superRefine((graph, ctx) => {
    if (graph.nodes.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Journey must include at least one Trigger step",
        path: ["nodes"],
      });
      return;
    }

    const nodeIdToIndex = new Map<string, number>();
    const nodeById = new Map<string, JourneyGraphNode>();
    const incomingByNodeId = new Map<string, number>();
    const outgoingByNodeId = new Map<string, number>();
    const outgoingEdgesBySourceId = new Map<string, JourneyGraphEdge[]>();
    const actionTypeByNodeId = new Map<string, string>();
    const conditionBranchSetBySourceId = new Map<
      string,
      Set<ConditionBranch>
    >();
    const triggerBranchSetBySourceId = new Map<string, Set<TriggerBranch>>();
    const triggerNodeIds: string[] = [];

    for (const [index, node] of graph.nodes.entries()) {
      const nodeId = node.attributes.id;
      if (nodeIdToIndex.has(nodeId)) {
        ctx.addIssue({
          code: "custom",
          message: "Step IDs must be unique",
          path: ["nodes", index, "attributes", "id"],
        });
        continue;
      }

      nodeIdToIndex.set(nodeId, index);
      nodeById.set(nodeId, node);
      incomingByNodeId.set(nodeId, 0);
      outgoingByNodeId.set(nodeId, 0);
      outgoingEdgesBySourceId.set(nodeId, []);

      const data = node.attributes.data;
      if (data.type === "trigger") {
        triggerNodeIds.push(nodeId);

        const parsedTriggerConfig = journeyTriggerConfigSchema.safeParse(
          data.config,
        );
        if (!parsedTriggerConfig.success) {
          ctx.addIssue({
            code: "custom",
            message:
              "Trigger step must use a supported journey trigger configuration",
            path: ["nodes", index, "attributes", "data", "config"],
          });
        }

        continue;
      }

      const normalizedActionType = normalizeJourneyActionType(
        data.config?.["actionType"],
      );

      const actionType = normalizedActionType;

      if (actionType === null) {
        ctx.addIssue({
          code: "custom",
          message:
            "Action steps must declare a supported step type (Wait, Wait For Confirmation, Send Email, Send Email Template, Send Channel Message, Send SMS, Condition, Logger)",
          path: ["nodes", index, "attributes", "data", "config", "actionType"],
        });
        continue;
      }

      const parsedActionType =
        supportedJourneyActionTypeSchema.safeParse(actionType);
      if (!parsedActionType.success) {
        ctx.addIssue({
          code: "custom",
          message:
            "Unsupported step type. Allowed step types are Trigger, Wait, Wait For Confirmation, Send Email, Send Email Template, Send Channel Message, Send SMS, Condition, and Logger",
          path: ["nodes", index, "attributes", "data", "config", "actionType"],
        });
        continue;
      }

      actionTypeByNodeId.set(nodeId, actionType);

      if (actionType === "condition") {
        const expression = getConditionExpression(data.config);
        if (expression === null) {
          ctx.addIssue({
            code: "custom",
            message: "Condition steps must include a non-empty rule expression",
            path: [
              "nodes",
              index,
              "attributes",
              "data",
              "config",
              "expression",
            ],
          });
        }
      }
    }

    if (triggerNodeIds.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Journey must include exactly one Trigger step",
        path: ["nodes"],
      });
    }

    for (const [index, edge] of graph.edges.entries()) {
      const sourceIndex = nodeIdToIndex.get(edge.source);
      const targetIndex = nodeIdToIndex.get(edge.target);

      if (sourceIndex === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "Edge source does not reference an existing step",
          path: ["edges", index, "source"],
        });
        continue;
      }

      if (targetIndex === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "Edge target does not reference an existing step",
          path: ["edges", index, "target"],
        });
        continue;
      }

      if (edge.source === edge.target) {
        ctx.addIssue({
          code: "custom",
          message: "Journeys cannot contain self-loop steps",
          path: ["edges", index],
        });
      }

      outgoingByNodeId.set(
        edge.source,
        (outgoingByNodeId.get(edge.source) ?? 0) + 1,
      );
      incomingByNodeId.set(
        edge.target,
        (incomingByNodeId.get(edge.target) ?? 0) + 1,
      );
      const sourceOutgoingEdges = outgoingEdgesBySourceId.get(edge.source);
      if (sourceOutgoingEdges) {
        sourceOutgoingEdges.push(edge);
      } else {
        outgoingEdgesBySourceId.set(edge.source, [edge]);
      }

      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      if (!sourceNode || !targetNode) {
        continue;
      }

      if (targetNode.attributes.data.type === "trigger") {
        ctx.addIssue({
          code: "custom",
          message: "Trigger step cannot have incoming edges",
          path: ["edges", index, "target"],
        });
      }

      const sourceActionType = actionTypeByNodeId.get(edge.source);
      if (sourceActionType === "condition") {
        const conditionBranch = getConditionBranchFromEdge(edge);
        if (!conditionBranch) {
          ctx.addIssue({
            code: "custom",
            message:
              'Condition edges must be labeled as either "true" or "false"',
            path: ["edges", index, "attributes"],
          });
          continue;
        }

        const existingBranches =
          conditionBranchSetBySourceId.get(edge.source) ??
          new Set<ConditionBranch>();

        if (existingBranches.has(conditionBranch)) {
          ctx.addIssue({
            code: "custom",
            message: "Condition step cannot have duplicate branch labels",
            path: ["edges", index, "attributes"],
          });
          continue;
        }

        existingBranches.add(conditionBranch);
        conditionBranchSetBySourceId.set(edge.source, existingBranches);
        continue;
      }

      if (sourceNode.attributes.data.type === "trigger") {
        const triggerBranch = getTriggerBranchFromEdge(edge);
        if (triggerBranch) {
          const existingBranches =
            triggerBranchSetBySourceId.get(edge.source) ??
            new Set<TriggerBranch>();

          if (existingBranches.has(triggerBranch)) {
            ctx.addIssue({
              code: "custom",
              message: "Trigger step cannot have duplicate branch labels",
              path: ["edges", index, "attributes"],
            });
            continue;
          }

          existingBranches.add(triggerBranch);
          triggerBranchSetBySourceId.set(edge.source, existingBranches);
          continue;
        }
        // trigger edge without branch label is ok (backwards compat)
        continue;
      }

      const branch = getConditionBranchFromEdge(edge);
      const tBranch = getTriggerBranchFromEdge(edge);
      if (branch || tBranch) {
        ctx.addIssue({
          code: "custom",
          message: "Only Condition steps can emit true/false branch edges",
          path: ["edges", index, "attributes"],
        });
      }
    }

    for (const [nodeId, index] of nodeIdToIndex.entries()) {
      const node = nodeById.get(nodeId);
      if (!node) {
        continue;
      }

      const incoming = incomingByNodeId.get(nodeId) ?? 0;
      const outgoing = outgoingByNodeId.get(nodeId) ?? 0;
      const actionType = actionTypeByNodeId.get(nodeId);
      const isTrigger = node.attributes.data.type === "trigger";
      const isCondition = actionType === "condition";

      if (isTrigger) {
        if (incoming !== 0) {
          ctx.addIssue({
            code: "custom",
            message: "Trigger step must have no incoming edges",
            path: ["nodes", index, "attributes", "id"],
          });
        }

        if (outgoing > 2) {
          ctx.addIssue({
            code: "custom",
            message: "Trigger step can have at most two outgoing branches",
            path: ["nodes", index, "attributes", "id"],
          });
        }

        if (outgoing === 2) {
          const branches = triggerBranchSetBySourceId.get(nodeId) ?? new Set();
          // Only enforce branch labels when at least one edge is labeled (backwards compat)
          if (
            branches.size > 0 &&
            !(branches.has("scheduled") && branches.has("canceled"))
          ) {
            ctx.addIssue({
              code: "custom",
              message:
                'Trigger step with two outgoing edges must include exactly one "scheduled" and one "canceled" branch',
              path: ["nodes", index, "attributes", "id"],
            });
          }
        }

        continue;
      }

      if (incoming !== 1) {
        ctx.addIssue({
          code: "custom",
          message: "Every non-trigger step must have exactly one incoming edge",
          path: ["nodes", index, "attributes", "id"],
        });
      }

      if (isCondition) {
        if (outgoing > 2) {
          ctx.addIssue({
            code: "custom",
            message: "Condition step can have at most two outgoing branches",
            path: ["nodes", index, "attributes", "id"],
          });
        }

        if (outgoing === 2) {
          const branches =
            conditionBranchSetBySourceId.get(nodeId) ?? new Set();
          if (!(branches.has("true") && branches.has("false"))) {
            ctx.addIssue({
              code: "custom",
              message:
                'Condition step with two outgoing edges must include exactly one "true" and one "false" branch',
              path: ["nodes", index, "attributes", "id"],
            });
          }
        }

        continue;
      }
    }

    const triggerNodeId = triggerNodeIds[0];
    if (!triggerNodeId) {
      return;
    }

    const visitedNodeIds = new Set<string>();
    const stack = [triggerNodeId];

    while (stack.length > 0) {
      const currentNodeId = stack.pop();
      if (!currentNodeId || visitedNodeIds.has(currentNodeId)) {
        continue;
      }

      visitedNodeIds.add(currentNodeId);

      const outgoingEdges = outgoingEdgesBySourceId.get(currentNodeId) ?? [];
      for (const edge of outgoingEdges) {
        stack.push(edge.target);
      }
    }

    if (visitedNodeIds.size !== graph.nodes.length) {
      ctx.addIssue({
        code: "custom",
        message: "Journey must be connected to the Trigger step",
        path: ["nodes"],
      });
    }

    // Validate no wait nodes on canceled branch
    const triggerNodeId2 = triggerNodeIds[0];
    if (triggerNodeId2) {
      const triggerOutgoingEdges =
        outgoingEdgesBySourceId.get(triggerNodeId2) ?? [];
      const canceledEdgeTargets = triggerOutgoingEdges
        .filter((edge) => getTriggerBranchFromEdge(edge) === "canceled")
        .map((edge) => edge.target);

      if (canceledEdgeTargets.length > 0) {
        const cancelPathVisited = new Set<string>();
        const cancelStack = [...canceledEdgeTargets];

        while (cancelStack.length > 0) {
          const currentId = cancelStack.pop();
          if (!currentId || cancelPathVisited.has(currentId)) {
            continue;
          }
          cancelPathVisited.add(currentId);

          const nodeActionType = actionTypeByNodeId.get(currentId);
          if (
            nodeActionType === "wait" ||
            nodeActionType === "wait-for-confirmation"
          ) {
            const nodeIndex = nodeIdToIndex.get(currentId);
            ctx.addIssue({
              code: "custom",
              message:
                "Wait and Wait For Confirmation steps are not allowed on the canceled branch",
              path: ["nodes", nodeIndex ?? 0, "attributes", "data", "config"],
            });
          }

          const nextEdges = outgoingEdgesBySourceId.get(currentId) ?? [];
          for (const edge of nextEdges) {
            cancelStack.push(edge.target);
          }
        }
      }
    }
  });

export const journeySchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  name: z.string().trim().min(1).max(255),
  status: journeyStatusSchema,
  mode: journeyModeSchema,
  currentVersion: positiveIntSchema.nullable(),
  graph: linearJourneyGraphSchema,
  ...timestampsSchema.shape,
});

export const createJourneySchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  graph: linearJourneyGraphSchema,
});

export const updateJourneySchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    graph: linearJourneyGraphSchema.optional(),
    mode: journeyPublishModeSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const publishJourneySchema = z.object({
  mode: journeyPublishModeSchema.default("live"),
});

export const resumeJourneySchema = z.object({});

export const startJourneyTestRunSchema = z.object({
  appointmentId: uuidSchema,
});

export const journeyResponseSchema = journeySchema;
export const journeyListResponseSchema = z.array(journeyResponseSchema);

export const journeyVersionSchema = z.object({
  id: uuidSchema,
  journeyId: uuidSchema,
  version: positiveIntSchema,
  publishedAt: timestampSchema,
});

export const publishJourneyResponseSchema = z.object({
  journey: journeyResponseSchema,
  version: positiveIntSchema,
  warnings: z.array(z.string()),
});

export const listJourneyRunsQuerySchema = z.object({
  mode: journeyRunModeSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const listJourneyRunsByEntityQuerySchema = z.object({
  entityType: z.enum(["client", "appointment"]),
  entityId: uuidSchema,
  mode: journeyRunModeSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const journeyVersionSnapshotSchema = z
  .object({
    version: positiveIntSchema.optional(),
  })
  .catchall(z.unknown());

export const journeyRunSchema = z.object({
  id: uuidSchema,
  journeyVersionId: uuidSchema.nullable(),
  appointmentId: uuidSchema.nullable(),
  mode: journeyRunModeSchema,
  status: journeyRunStatusSchema,
  journeyNameSnapshot: z.string().min(1),
  journeyVersion: positiveIntSchema.nullable(),
  journeyDeleted: z.boolean(),
  startedAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
  cancelledAt: timestampSchema.nullable(),
});

export const journeyRunSidebarSubjectSchema = z.object({
  type: z.enum(["client", "appointment", "unknown"]),
  primary: z.string().trim().min(1).nullable(),
  secondary: z.string().trim().min(1).nullable(),
});

export const journeyRunSidebarNextStateSchema = z.object({
  label: z.string().trim().min(1),
  at: timestampSchema.nullable(),
  channel: z.string().trim().min(1).nullable(),
});

export const journeyRunSidebarSummarySchema = z.object({
  subject: journeyRunSidebarSubjectSchema,
  triggerEventType: z.string().trim().min(1).nullable(),
  statusReason: z.string().trim().min(1).nullable(),
  nextState: journeyRunSidebarNextStateSchema.nullable(),
  channelHint: z.string().trim().min(1).nullable(),
});

export const journeyRunListItemSchema = journeyRunSchema.extend({
  journeyId: uuidSchema.nullable(),
  sidebarSummary: journeyRunSidebarSummarySchema,
});

export const journeyRunListResponseSchema = z.array(journeyRunListItemSchema);

export const journeyRunDeliverySchema = z.object({
  id: uuidSchema,
  journeyRunId: uuidSchema,
  stepKey: z.string().min(1),
  channel: z.string().min(1),
  scheduledFor: timestampSchema,
  status: journeyDeliveryStatusSchema,
  reasonCode: journeyDeliveryReasonCodeSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const journeyRunEventSchema = z.object({
  id: uuidSchema,
  journeyRunId: uuidSchema,
  eventType: z.string().trim().min(1),
  message: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: timestampSchema,
});

export const journeyRunStepLogSchema = z.object({
  id: uuidSchema,
  journeyRunId: uuidSchema,
  stepKey: z.string().trim().min(1),
  nodeType: z.string().trim().min(1),
  status: journeyRunStepLogStatusSchema,
  input: z.record(z.string(), z.unknown()).nullable(),
  output: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  startedAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
  durationMs: nonNegativeIntSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const journeyRunTriggerAppointmentSchema = z.object({
  id: uuidSchema,
  calendarId: uuidSchema,
  appointmentTypeId: uuidSchema,
  clientId: uuidSchema.nullable(),
  startAt: timestampSchema,
  endAt: timestampSchema,
  timezone: z.string().trim().min(1),
  status: z.string().trim().min(1),
  notes: z.string().nullable(),
});

export const journeyRunTriggerClientSchema = z.object({
  id: uuidSchema,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

export const journeyRunTriggerContextSchema = z.object({
  eventType: z.string().trim().min(1).nullable(),
  appointment: journeyRunTriggerAppointmentSchema.nullable(),
  client: journeyRunTriggerClientSchema.nullable(),
  payload: z.record(z.string(), z.unknown()).nullable(),
});

export const journeyRunDetailResponseSchema = z.object({
  run: journeyRunSchema,
  runSnapshot: journeyVersionSnapshotSchema,
  deliveries: z.array(journeyRunDeliverySchema),
  events: z.array(journeyRunEventSchema),
  stepLogs: z.array(journeyRunStepLogSchema),
  triggerContext: journeyRunTriggerContextSchema.nullable(),
});

export const cancelJourneyRunResponseSchema = z.object({
  run: journeyRunSchema,
  canceled: z.boolean(),
});

export const cancelJourneyRunsResponseSchema = z.object({
  success: z.literal(true),
  canceledRunCount: nonNegativeIntSchema,
});

export const startJourneyTestRunResponseSchema = z.object({
  runId: uuidSchema,
  mode: z.literal("test"),
});

export const deleteJourneyResponseSchema = successResponseSchema;

export type LinearJourneyGraph = z.infer<typeof linearJourneyGraphSchema>;
export type JourneyStatus = z.infer<typeof journeyStatusSchema>;
export type JourneyMode = z.infer<typeof journeyModeSchema>;
export type JourneyPublishMode = z.infer<typeof journeyPublishModeSchema>;
export type SetJourneyModeInput = z.infer<typeof setJourneyModeSchema>;
export type JourneyRunMode = z.infer<typeof journeyRunModeSchema>;
export type JourneyRunStatus = z.infer<typeof journeyRunStatusSchema>;
export type JourneyDeliveryStatus = z.infer<typeof journeyDeliveryStatusSchema>;
export type JourneyRunStepLogStatus = z.infer<
  typeof journeyRunStepLogStatusSchema
>;
export type JourneyDeliveryReasonCode = z.infer<
  typeof journeyDeliveryReasonCodeSchema
>;
export type Journey = z.infer<typeof journeySchema>;
export type CreateJourneyInput = z.infer<typeof createJourneySchema>;
export type UpdateJourneyInput = z.infer<typeof updateJourneySchema>;
export type PublishJourneyInput = z.infer<typeof publishJourneySchema>;
export type ResumeJourneyInput = z.infer<typeof resumeJourneySchema>;
export type StartJourneyTestRunInput = z.infer<
  typeof startJourneyTestRunSchema
>;
export type JourneyResponse = z.infer<typeof journeyResponseSchema>;
export type JourneyListResponse = z.infer<typeof journeyListResponseSchema>;
export type PublishJourneyResponse = z.infer<
  typeof publishJourneyResponseSchema
>;
export type ListJourneyRunsQuery = z.infer<typeof listJourneyRunsQuerySchema>;
export type ListJourneyRunsByEntityQuery = z.infer<
  typeof listJourneyRunsByEntityQuerySchema
>;
export type JourneyRun = z.infer<typeof journeyRunSchema>;
export type JourneyRunListItem = z.infer<typeof journeyRunListItemSchema>;
export type JourneyRunListResponse = z.infer<
  typeof journeyRunListResponseSchema
>;
export type JourneyRunDelivery = z.infer<typeof journeyRunDeliverySchema>;
export type JourneyRunEvent = z.infer<typeof journeyRunEventSchema>;
export type JourneyRunStepLog = z.infer<typeof journeyRunStepLogSchema>;
export type JourneyRunTriggerAppointment = z.infer<
  typeof journeyRunTriggerAppointmentSchema
>;
export type JourneyRunTriggerClient = z.infer<
  typeof journeyRunTriggerClientSchema
>;
export type JourneyRunTriggerContext = z.infer<
  typeof journeyRunTriggerContextSchema
>;
export type JourneyRunDetailResponse = z.infer<
  typeof journeyRunDetailResponseSchema
>;
export type CancelJourneyRunResponse = z.infer<
  typeof cancelJourneyRunResponseSchema
>;
export type CancelJourneyRunsResponse = z.infer<
  typeof cancelJourneyRunsResponseSchema
>;
export type StartJourneyTestRunResponse = z.infer<
  typeof startJourneyTestRunResponseSchema
>;
export type DeleteJourneyResponse = z.infer<typeof deleteJourneyResponseSchema>;
