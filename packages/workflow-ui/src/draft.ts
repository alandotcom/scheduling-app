import { webhookEventTypes, type WebhookEventType } from "@scheduling/dto";
import {
  workflowGraphDocumentSchema,
  type WorkflowGraphDocument,
} from "@scheduling/dto";

function isWebhookEventType(value: string): value is WebhookEventType {
  return (webhookEventTypes as readonly string[]).includes(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function stableStringify(value: unknown): string {
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

export function getTriggerEventTypeFromDraft(
  workflowGraph: Record<string, unknown>,
  fallback: WebhookEventType,
): WebhookEventType {
  const candidate = workflowGraph["trigger"];
  if (!isRecord(candidate)) {
    return fallback;
  }

  const eventType = candidate["eventType"] ?? candidate["event"];
  if (typeof eventType === "string" && isWebhookEventType(eventType)) {
    return eventType;
  }

  return fallback;
}

export function withDraftTriggerEventType(
  workflowGraph: Record<string, unknown>,
  eventType: WebhookEventType,
): Record<string, unknown> {
  const currentTrigger = workflowGraph["trigger"];
  const nextTrigger = isRecord(currentTrigger)
    ? { ...currentTrigger, event: eventType, eventType }
    : { event: eventType, eventType };

  return {
    ...workflowGraph,
    trigger: nextTrigger,
  };
}

export function getWorkflowGraphDocumentFromDraft(
  workflowGraph: Record<string, unknown>,
): WorkflowGraphDocument {
  const parsed = workflowGraphDocumentSchema.safeParse(workflowGraph);
  if (parsed.success) {
    return parsed.data;
  }

  return workflowGraphDocumentSchema.parse({
    schemaVersion: 1,
    nodes: [],
    edges: [],
  });
}

export function withDraftGraphDocument(
  workflowGraph: Record<string, unknown>,
  document: WorkflowGraphDocument,
): Record<string, unknown> {
  return {
    ...workflowGraph,
    schemaVersion: document.schemaVersion,
    nodes: document.nodes,
    edges: document.edges,
  };
}
