import { z } from "zod";
import {
  successResponseSchema,
  timestampSchema,
  timestampsSchema,
  uuidSchema,
} from "./common";
import {
  journeyTriggerConfigSchema,
  serializedJourneyGraphSchema,
} from "./workflow-graph";

export const journeyStateSchema = z.enum([
  "draft",
  "published",
  "paused",
  "test_only",
]);

export const journeyPublishModeSchema = z.enum(["live", "test"]);
export const journeyResumeTargetStateSchema = z.enum([
  "published",
  "test_only",
]);
export const journeyRunModeSchema = z.enum(["live", "test"]);
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
export const journeyDeliveryReasonCodeSchema = z
  .string()
  .trim()
  .min(1)
  .nullable();

const supportedJourneyActionTypeSchema = z.enum([
  "wait",
  "send-resend",
  "send-slack",
  "logger",
]);

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
    const incomingByNodeId = new Map<string, number>();
    const outgoingByNodeId = new Map<string, number>();
    const nextNodeIdBySourceId = new Map<string, string>();
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
      incomingByNodeId.set(nodeId, 0);
      outgoingByNodeId.set(nodeId, 0);

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
              "Trigger step must use the fixed appointment journey trigger configuration",
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
            "Action steps must declare a supported step type (Wait, Send Resend, Send Slack, Logger)",
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
            "Unsupported step type. Allowed step types are Trigger, Wait, Send Resend, Send Slack, and Logger",
          path: ["nodes", index, "attributes", "data", "config", "actionType"],
        });
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
          message: "Linear journeys cannot contain self-loop steps",
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

      if (nextNodeIdBySourceId.has(edge.source)) {
        ctx.addIssue({
          code: "custom",
          message: "Linear journeys cannot branch to multiple next steps",
          path: ["edges", index, "source"],
        });
      } else {
        nextNodeIdBySourceId.set(edge.source, edge.target);
      }
    }

    for (const [nodeId, index] of nodeIdToIndex.entries()) {
      const incoming = incomingByNodeId.get(nodeId) ?? 0;
      const outgoing = outgoingByNodeId.get(nodeId) ?? 0;

      if (incoming > 1) {
        ctx.addIssue({
          code: "custom",
          message: "Linear journeys cannot merge multiple previous steps",
          path: ["nodes", index, "attributes", "id"],
        });
      }

      if (outgoing > 1) {
        ctx.addIssue({
          code: "custom",
          message: "Linear journeys cannot branch to multiple next steps",
          path: ["nodes", index, "attributes", "id"],
        });
      }
    }

    const rootNodeIds = [...incomingByNodeId.entries()]
      .filter(([, incoming]) => incoming === 0)
      .map(([nodeId]) => nodeId);
    const terminalNodeIds = [...outgoingByNodeId.entries()]
      .filter(([, outgoing]) => outgoing === 0)
      .map(([nodeId]) => nodeId);

    if (rootNodeIds.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Journey must have exactly one starting Trigger step",
        path: ["nodes"],
      });
      return;
    }

    if (terminalNodeIds.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Journey must have exactly one terminal step",
        path: ["nodes"],
      });
    }

    const rootNodeId = rootNodeIds[0]!;
    const rootIndex = nodeIdToIndex.get(rootNodeId);
    const rootNode = rootIndex === undefined ? null : graph.nodes[rootIndex];

    if (rootNode?.attributes.data.type !== "trigger") {
      ctx.addIssue({
        code: "custom",
        message: "Journey must start with a Trigger step",
        path:
          rootIndex === undefined
            ? ["nodes"]
            : ["nodes", rootIndex, "attributes", "data", "type"],
      });
    }

    if (graph.edges.length !== graph.nodes.length - 1) {
      ctx.addIssue({
        code: "custom",
        message: "Linear journeys must connect each step exactly once",
        path: ["edges"],
      });
    }

    const visitedNodeIds = new Set<string>();
    let currentNodeId: string | undefined = rootNodeId;
    while (currentNodeId) {
      if (visitedNodeIds.has(currentNodeId)) {
        ctx.addIssue({
          code: "custom",
          message: "Linear journeys cannot contain cycles",
          path: ["edges"],
        });
        break;
      }

      visitedNodeIds.add(currentNodeId);
      currentNodeId = nextNodeIdBySourceId.get(currentNodeId);
    }

    if (visitedNodeIds.size !== graph.nodes.length) {
      ctx.addIssue({
        code: "custom",
        message: "Journey must be a single connected linear step chain",
        path: ["nodes"],
      });
    }
  });

export const journeySchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  name: z.string().trim().min(1).max(255),
  state: journeyStateSchema,
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
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const publishJourneySchema = z.object({
  mode: journeyPublishModeSchema.default("live"),
});

export const resumeJourneySchema = z.object({
  targetState: journeyResumeTargetStateSchema.default("published"),
});

export const startJourneyTestRunSchema = z.object({
  appointmentId: uuidSchema,
  emailOverride: z.email().optional(),
});

export const journeyResponseSchema = journeySchema;
export const journeyListResponseSchema = z.array(journeyResponseSchema);

export const journeyVersionSchema = z.object({
  id: uuidSchema,
  journeyId: uuidSchema,
  version: z.number().int().positive(),
  publishedAt: timestampSchema,
});

export const publishJourneyResponseSchema = z.object({
  journey: journeyResponseSchema,
  version: z.number().int().positive(),
  warnings: z.array(z.string()),
});

export const listJourneyRunsQuerySchema = z.object({
  mode: journeyRunModeSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const journeyVersionSnapshotSchema = z
  .object({
    version: z.number().int().positive().optional(),
  })
  .catchall(z.unknown());

export const journeyRunSchema = z.object({
  id: uuidSchema,
  journeyVersionId: uuidSchema.nullable(),
  appointmentId: uuidSchema,
  mode: journeyRunModeSchema,
  status: journeyRunStatusSchema,
  journeyNameSnapshot: z.string().min(1),
  journeyVersion: z.number().int().positive().nullable(),
  journeyDeleted: z.boolean(),
  startedAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
  cancelledAt: timestampSchema.nullable(),
});

export const journeyRunListResponseSchema = z.array(journeyRunSchema);

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

export const journeyRunDetailResponseSchema = z.object({
  run: journeyRunSchema,
  runSnapshot: journeyVersionSnapshotSchema,
  deliveries: z.array(journeyRunDeliverySchema),
});

export const cancelJourneyRunResponseSchema = z.object({
  run: journeyRunSchema,
  canceled: z.boolean(),
});

export const cancelJourneyRunsResponseSchema = z.object({
  success: z.literal(true),
  canceledRunCount: z.number().int().nonnegative(),
});

export const startJourneyTestRunResponseSchema = z.object({
  runId: uuidSchema,
  mode: z.literal("test"),
});

export const deleteJourneyResponseSchema = successResponseSchema;

export type LinearJourneyGraph = z.infer<typeof linearJourneyGraphSchema>;
export type JourneyState = z.infer<typeof journeyStateSchema>;
export type JourneyPublishMode = z.infer<typeof journeyPublishModeSchema>;
export type JourneyResumeTargetState = z.infer<
  typeof journeyResumeTargetStateSchema
>;
export type JourneyRunMode = z.infer<typeof journeyRunModeSchema>;
export type JourneyRunStatus = z.infer<typeof journeyRunStatusSchema>;
export type JourneyDeliveryStatus = z.infer<typeof journeyDeliveryStatusSchema>;
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
export type JourneyRun = z.infer<typeof journeyRunSchema>;
export type JourneyRunListResponse = z.infer<
  typeof journeyRunListResponseSchema
>;
export type JourneyRunDelivery = z.infer<typeof journeyRunDeliverySchema>;
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
