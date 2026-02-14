import type {
  DomainEventType,
  SerializedWorkflowGraph,
  WorkflowDomainEventTriggerConfig,
  WorkflowNodeData,
} from "@scheduling/dto";
import { getDomainForDomainEventType } from "@scheduling/dto";
import { workflowDomainEventTriggerConfigSchema } from "@scheduling/dto";

type TriggerIgnoreReason = "missing_event_type" | "event_not_configured";

export type TriggerRoutingDecision =
  | { kind: "start" }
  | { kind: "restart" }
  | { kind: "stop" }
  | { kind: "ignore"; reason: TriggerIgnoreReason };

export type TriggerEvaluation = {
  triggerType: string;
  executionType: "domain_event";
  eventType: DomainEventType | undefined;
  correlationKey: string | undefined;
  routingDecision: TriggerRoutingDecision;
  metadata?: {
    correlationPath?: string;
  };
};

const DOMAIN_CORRELATION_KEY_BY_PREFIX: Record<string, string> = {
  appointment: "appointmentId",
  calendar: "calendarId",
  appointment_type: "appointmentTypeId",
  resource: "resourceId",
  location: "locationId",
  client: "clientId",
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  return Object.fromEntries(Object.entries(value));
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getValueAtPath(input: Record<string, unknown>, path: string): unknown {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  let current: unknown = input;
  for (const segment of segments) {
    const currentRecord = asRecord(current);
    if (!currentRecord) {
      return;
    }
    current = currentRecord[segment];
  }

  return current;
}

function deriveCorrelationKey(input: {
  eventType: DomainEventType;
  payload: Record<string, unknown>;
  correlationPath: string | undefined;
}): string | undefined {
  if (input.correlationPath) {
    return asNonEmptyString(
      getValueAtPath(input.payload, input.correlationPath),
    );
  }

  const domain = getDomainForDomainEventType(input.eventType);
  const defaultCorrelationField = DOMAIN_CORRELATION_KEY_BY_PREFIX[domain];

  if (!defaultCorrelationField) {
    return;
  }

  return asNonEmptyString(input.payload[defaultCorrelationField]);
}

function decideRouting(input: {
  eventType: DomainEventType | undefined;
  config: WorkflowDomainEventTriggerConfig | undefined;
}): TriggerRoutingDecision {
  if (!input.eventType) {
    return { kind: "ignore", reason: "missing_event_type" };
  }

  if (!input.config) {
    return { kind: "ignore", reason: "event_not_configured" };
  }

  if (input.config.stopEvents.includes(input.eventType)) {
    return { kind: "stop" };
  }

  if (input.config.restartEvents.includes(input.eventType)) {
    return { kind: "restart" };
  }

  if (input.config.startEvents.includes(input.eventType)) {
    return { kind: "start" };
  }

  return { kind: "ignore", reason: "event_not_configured" };
}

function getTriggerConfigFromNodeData(
  data: WorkflowNodeData,
): WorkflowDomainEventTriggerConfig | undefined {
  if (data.type !== "trigger" || !data.config) {
    return;
  }

  const parsed = workflowDomainEventTriggerConfigSchema.safeParse(data.config);
  if (!parsed.success) {
    return;
  }

  return parsed.data;
}

export function getWorkflowTriggerConfig(
  graph: SerializedWorkflowGraph,
): WorkflowDomainEventTriggerConfig | undefined {
  for (const node of graph.nodes) {
    const data = node.attributes.data;
    const config = getTriggerConfigFromNodeData(data);

    if (config) {
      return config;
    }
  }

  return;
}

export function evaluateWorkflowDomainEventTrigger(input: {
  config: WorkflowDomainEventTriggerConfig | undefined;
  eventType: DomainEventType | undefined;
  payload: Record<string, unknown>;
}): TriggerEvaluation {
  const routingDecision = decideRouting({
    eventType: input.eventType,
    config: input.config,
  });
  const correlationPath = input.config?.domainEventCorrelationPath;

  const correlationKey =
    input.eventType === undefined
      ? undefined
      : deriveCorrelationKey({
          eventType: input.eventType,
          payload: input.payload,
          correlationPath,
        });

  return {
    triggerType: input.config?.triggerType ?? "DomainEvent",
    executionType: "domain_event",
    eventType: input.eventType,
    correlationKey,
    routingDecision,
    ...(correlationPath ? { metadata: { correlationPath } } : {}),
  };
}
