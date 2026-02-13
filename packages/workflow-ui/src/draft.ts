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

export function resolveTriggerEventType(
  workflowGraph: WorkflowGraphDocument,
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

export function withWorkflowTriggerEventType(
  workflowGraph: WorkflowGraphDocument,
  eventType: WebhookEventType,
): WorkflowGraphDocument {
  const currentTrigger = workflowGraph["trigger"];
  const nextTrigger = isRecord(currentTrigger)
    ? { ...currentTrigger, event: eventType, eventType }
    : { event: eventType, eventType };

  return workflowGraphDocumentSchema.parse({
    ...workflowGraph,
    trigger: nextTrigger,
  });
}
