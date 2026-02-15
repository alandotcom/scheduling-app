import type { SerializedWorkflowGraph } from "@scheduling/dto";
import type { DomainEventType } from "@scheduling/dto";
import { inngest } from "./client.js";

export type WorkflowRunRequestedEventData = {
  orgId: string;
  workflowId: string;
  workflowName: string;
  executionId: string;
  graph: SerializedWorkflowGraph;
  triggerInput: Record<string, unknown>;
  eventContext: {
    eventType: DomainEventType;
    correlationKey?: string;
  };
};

export type WorkflowCancelRequestedEventData = {
  executionId: string;
  workflowId: string;
  reason: string;
  requestedBy: string;
  eventType?: DomainEventType;
  correlationKey?: string;
};

type InngestSendResult =
  | {
      eventId?: string;
      ids?: string[];
      id?: string;
      eventIds?: string[];
    }
  | Array<{
      eventId?: string;
      ids?: string[];
      id?: string;
      eventIds?: string[];
    }>;

function getEventId(result: unknown): string | undefined {
  if (!result) {
    return;
  }

  if (Array.isArray(result)) {
    return getEventId(result[0]);
  }

  if (typeof result !== "object") {
    return;
  }

  const typedResult = result as InngestSendResult;
  if ("eventId" in typedResult && typeof typedResult.eventId === "string") {
    return typedResult.eventId;
  }
  if ("id" in typedResult && typeof typedResult.id === "string") {
    return typedResult.id;
  }
  if (
    "eventIds" in typedResult &&
    Array.isArray(typedResult.eventIds) &&
    typeof typedResult.eventIds[0] === "string"
  ) {
    return typedResult.eventIds[0];
  }
  if (
    "ids" in typedResult &&
    Array.isArray(typedResult.ids) &&
    typeof typedResult.ids[0] === "string"
  ) {
    return typedResult.ids[0];
  }

  return;
}

export async function sendWorkflowRunRequested(
  input: WorkflowRunRequestedEventData,
): Promise<{ eventId?: string }> {
  const response = await inngest.send({
    id: `workflow-run-${input.executionId}`,
    name: "workflow/run.requested",
    data: input,
  });

  const eventId = getEventId(response);

  if (eventId) {
    return { eventId };
  }

  return {};
}

export async function sendWorkflowCancelRequested(
  input: WorkflowCancelRequestedEventData,
): Promise<{ eventId?: string }> {
  const response = await inngest.send({
    id: `workflow-cancel-${input.executionId}-${Date.now()}`,
    name: "workflow/run.cancel.requested",
    data: input,
  });

  const eventId = getEventId(response);
  if (eventId) {
    return { eventId };
  }

  return {};
}
