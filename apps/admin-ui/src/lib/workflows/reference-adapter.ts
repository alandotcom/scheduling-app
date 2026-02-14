import {
  domainEventDomains,
  workflowCatalogResponseSchema,
  workflowGraphDocumentSchema,
  type DomainEventDomain,
  type DomainEventType,
  type WorkflowActionCatalogItem,
  type WorkflowCatalogResponse,
  type WorkflowGraphDocument,
  type WorkflowGraphEdge,
  type WorkflowGraphNode,
  type WorkflowGuard,
  type WorkflowRunStatus,
} from "@scheduling/dto";

const DEFAULT_TRIGGER_NODE_ID = "trigger";
const DEFAULT_WEBHOOK_EVENT_PATH = "event";
const DEFAULT_WEBHOOK_CORRELATION_PATH = "data.id";
const DEFAULT_SCHEDULE_TIMEZONE = "America/New_York";
const DEFAULT_WAIT_DURATION = "PT1M";
const DEFAULT_DOMAIN_EVENT_TRIGGER_DOMAIN: DomainEventDomain = "appointment";
const DEFAULT_DOMAIN_EVENT_START_EVENT: DomainEventType = "appointment.created";

type WorkflowBranch = "next" | "timeout" | "true" | "false";
type WorkflowGuardOperator =
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "in"
  | "not_in"
  | "exists"
  | "not_exists";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBranch(value: unknown): value is WorkflowBranch {
  return (
    value === "next" ||
    value === "timeout" ||
    value === "true" ||
    value === "false"
  );
}

function isGuardOperator(value: unknown): value is WorkflowGuardOperator {
  return (
    value === "eq" ||
    value === "neq" ||
    value === "lt" ||
    value === "lte" ||
    value === "gt" ||
    value === "gte" ||
    value === "in" ||
    value === "not_in" ||
    value === "exists" ||
    value === "not_exists"
  );
}

function isDomainEventDomain(value: unknown): value is DomainEventDomain {
  return (
    value === "appointment" ||
    value === "calendar" ||
    value === "appointment_type" ||
    value === "resource" ||
    value === "location" ||
    value === "client"
  );
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function parseCsvSet(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return uniqueStrings(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

function toCsvSet(values: readonly string[]): string {
  return values.join(", ");
}

function isDomainEventType(value: string): value is DomainEventType {
  return domainEventDomains.some((domain) => value.startsWith(`${domain}.`));
}

function parseDomainEventSet(value: unknown): DomainEventType[] {
  return parseCsvSet(value).filter((entry) => isDomainEventType(entry));
}

function toWorkflowGuard(value: unknown): WorkflowGuard | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const combinator = value["combinator"] === "any" ? "any" : "all";
  const conditionsRaw = Array.isArray(value["conditions"])
    ? value["conditions"]
    : [];

  const conditions = conditionsRaw.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const field = entry["field"];
    const operator = entry["operator"];
    if (typeof field !== "string" || field.length === 0) {
      return [];
    }
    if (!isGuardOperator(operator)) {
      return [];
    }

    return [
      {
        field,
        operator,
        value: entry["value"],
      },
    ];
  });

  if (conditions.length === 0) {
    return undefined;
  }

  return {
    combinator,
    conditions,
  };
}

function normalizeWaitDuration(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return DEFAULT_WAIT_DURATION;
}

function inferDomain(input: {
  config: Record<string, unknown>;
  startEvents: DomainEventType[];
  restartEvents: DomainEventType[];
  stopEvents: DomainEventType[];
}): DomainEventDomain {
  const configuredDomain = input.config["domain"];
  if (isDomainEventDomain(configuredDomain)) {
    return configuredDomain;
  }

  const firstEvent = [
    ...input.startEvents,
    ...input.restartEvents,
    ...input.stopEvents,
  ][0];

  if (typeof firstEvent === "string") {
    const [prefix] = firstEvent.split(".");
    if (isDomainEventDomain(prefix)) {
      return prefix;
    }
  }

  return "appointment";
}

function extractActionInput(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const explicitInput = config["input"];
  if (isRecord(explicitInput)) {
    return explicitInput;
  }

  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (
      key === "actionType" ||
      key === "actionId" ||
      key === "integrationId" ||
      key === "guard" ||
      key === "condition" ||
      key === "duration" ||
      key === "waitDuration" ||
      key === "referenceField" ||
      key === "offsetDirection"
    ) {
      continue;
    }

    input[key] = value;
  }

  return input;
}

export type ReferenceWorkflowNode = {
  id: string;
  type: string;
  position?: { x: number; y: number };
  data?: {
    type?: string;
    label?: string;
    description?: string;
    config?: Record<string, unknown>;
    enabled?: boolean;
    status?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type ReferenceWorkflowEdge = {
  id: string;
  source: string;
  target: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ReferenceWorkflowGraph = {
  nodes: ReferenceWorkflowNode[];
  edges: ReferenceWorkflowEdge[];
};

export type ReferenceWebhookTriggerDomainOption = {
  domain: DomainEventDomain;
  startEvents: string[];
  restartEvents: string[];
  stopEvents: string[];
};

export type ReferenceTriggerCatalog =
  | {
      id: "Webhook";
      label: string;
      defaultEventPath: string;
      defaultCorrelationPath: string;
      domains: ReferenceWebhookTriggerDomainOption[];
    }
  | {
      id: "Schedule";
      label: string;
      defaultTimezone: string;
    };

export type ReferenceActionCatalogItem = {
  id: string;
  label: string;
  description?: string;
  category?: string;
  configFields?: WorkflowActionCatalogItem["configFields"];
  outputFields?: WorkflowActionCatalogItem["outputFields"];
};

export type ReferenceWorkflowCatalog = {
  triggerTypes: ReferenceTriggerCatalog[];
  actions: ReferenceActionCatalogItem[];
};

export type ReferenceRunStatus =
  | "pending"
  | "running"
  | "waiting"
  | "success"
  | "error"
  | "cancelled";

type ReferenceAdapterErrorCode = "UNKNOWN_TRIGGER_TYPE";

export class ReferenceAdapterError extends Error {
  readonly code: ReferenceAdapterErrorCode;

  constructor(code: ReferenceAdapterErrorCode, message: string) {
    super(message);
    this.name = "ReferenceAdapterError";
    this.code = code;
  }
}

export function createDefaultReferenceTriggerConfig(): Record<string, unknown> {
  return {
    triggerType: "Webhook",
    domain: DEFAULT_DOMAIN_EVENT_TRIGGER_DOMAIN,
    webhookEventPath: DEFAULT_WEBHOOK_EVENT_PATH,
    webhookCorrelationPath: DEFAULT_WEBHOOK_CORRELATION_PATH,
    webhookCreateEvents: DEFAULT_DOMAIN_EVENT_START_EVENT,
    webhookUpdateEvents: "",
    webhookDeleteEvents: "",
  };
}

export function createDefaultReferenceWorkflowGraph(): ReferenceWorkflowGraph {
  return {
    nodes: [
      {
        id: DEFAULT_TRIGGER_NODE_ID,
        type: "trigger",
        position: { x: 0, y: 80 },
        data: {
          type: "trigger",
          label: "",
          description: "",
          status: "idle",
          enabled: true,
          config: createDefaultReferenceTriggerConfig(),
        },
      },
    ],
    edges: [],
  };
}

function mapReferenceTriggerToCanonical(
  triggerConfig: Record<string, unknown>,
): WorkflowGraphDocument["trigger"] {
  const triggerType = triggerConfig["triggerType"];

  if (triggerType === "Schedule") {
    const scheduleExpression =
      typeof triggerConfig["scheduleExpression"] === "string" &&
      triggerConfig["scheduleExpression"].trim().length > 0
        ? triggerConfig["scheduleExpression"].trim()
        : typeof triggerConfig["scheduleCron"] === "string" &&
            triggerConfig["scheduleCron"].trim().length > 0
          ? triggerConfig["scheduleCron"].trim()
          : "";

    return {
      type: "schedule",
      expression: scheduleExpression,
      timezone:
        typeof triggerConfig["scheduleTimezone"] === "string" &&
        triggerConfig["scheduleTimezone"].trim().length > 0
          ? triggerConfig["scheduleTimezone"].trim()
          : DEFAULT_SCHEDULE_TIMEZONE,
    };
  }

  if (triggerType !== undefined && triggerType !== "Webhook") {
    const normalizedTriggerType =
      typeof triggerType === "string"
        ? triggerType
        : (JSON.stringify(triggerType) ?? typeof triggerType);
    throw new ReferenceAdapterError(
      "UNKNOWN_TRIGGER_TYPE",
      `Unknown reference trigger type "${normalizedTriggerType}"`,
    );
  }

  const startEvents = parseDomainEventSet(triggerConfig["webhookCreateEvents"]);
  const restartEvents = parseDomainEventSet(
    triggerConfig["webhookUpdateEvents"],
  );
  const stopEvents = parseDomainEventSet(triggerConfig["webhookDeleteEvents"]);
  const shouldUseDefaultStartEvent =
    triggerType === undefined &&
    startEvents.length === 0 &&
    restartEvents.length === 0 &&
    stopEvents.length === 0;

  return {
    type: "domain_event",
    domain: inferDomain({
      config: triggerConfig,
      startEvents: shouldUseDefaultStartEvent
        ? [DEFAULT_DOMAIN_EVENT_START_EVENT]
        : startEvents,
      restartEvents,
      stopEvents,
    }),
    startEvents: shouldUseDefaultStartEvent
      ? [DEFAULT_DOMAIN_EVENT_START_EVENT]
      : startEvents,
    restartEvents,
    stopEvents,
  };
}

function mapReferenceNodeToCanonical(
  node: ReferenceWorkflowNode,
): WorkflowGraphNode | null {
  if (
    node.type === "trigger" ||
    node.type === "add" ||
    node.data?.type === "trigger"
  ) {
    return null;
  }

  if (!isRecord(node.data)) {
    return null;
  }

  const config = isRecord(node.data.config) ? node.data.config : {};
  const actionType =
    typeof config["actionType"] === "string" ? config["actionType"].trim() : "";
  const nodeGuard = toWorkflowGuard(config["guard"]);

  if (actionType === "Wait") {
    const duration = normalizeWaitDuration(
      config["waitDuration"] ?? config["duration"],
    );
    const referenceField =
      typeof config["referenceField"] === "string" &&
      config["referenceField"].trim().length > 0
        ? config["referenceField"].trim()
        : undefined;
    const offsetDirection =
      config["offsetDirection"] === "before" ? "before" : "after";

    const waitNode: Extract<WorkflowGraphNode, { kind: "wait" }> = {
      id: node.id,
      kind: "wait",
      wait: {
        mode: "relative",
        duration,
        offsetDirection,
        ...(referenceField ? { referenceField } : {}),
      },
    };

    return waitNode;
  }

  if (actionType === "Condition") {
    return {
      id: node.id,
      kind: "condition",
      guard: nodeGuard ?? {
        combinator: "all",
        conditions: [
          {
            field: "trigger",
            operator: "exists",
          },
        ],
      },
    };
  }

  const actionId =
    typeof config["actionId"] === "string" &&
    config["actionId"].trim().length > 0
      ? config["actionId"].trim()
      : actionType || "core.emitInternalEvent";

  const actionNode: Extract<WorkflowGraphNode, { kind: "action" }> = {
    id: node.id,
    kind: "action",
    actionId,
    input: extractActionInput(config),
  };

  if (nodeGuard) {
    actionNode.guard = nodeGuard;
  }

  return actionNode;
}

function resolveReferenceEdgeBranch(input: {
  edge: ReferenceWorkflowEdge;
  sourceNodeKind: WorkflowGraphNode["kind"] | undefined;
}): WorkflowBranch | undefined {
  if (isBranch(input.edge["branch"])) {
    return input.edge["branch"];
  }

  if (isRecord(input.edge.data) && isBranch(input.edge.data["branch"])) {
    return input.edge.data["branch"];
  }

  if (input.sourceNodeKind === "condition") {
    return "true";
  }

  return undefined;
}

export function referenceGraphToCanonicalGraph(
  graph: ReferenceWorkflowGraph,
): WorkflowGraphDocument {
  const triggerNode = graph.nodes.find(
    (node) => node.type === "trigger" || node.data?.type === "trigger",
  );
  const triggerConfig =
    triggerNode &&
    isRecord(triggerNode.data) &&
    isRecord(triggerNode.data.config)
      ? triggerNode.data.config
      : {};

  const nodes = graph.nodes
    .flatMap((node) => {
      const mapped = mapReferenceNodeToCanonical(node);
      return mapped ? [mapped] : [];
    })
    .toSorted((left, right) => left.id.localeCompare(right.id));

  const sourceNodeKind = new Map<string, WorkflowGraphNode["kind"]>(
    nodes.map((node) => [node.id, node.kind]),
  );

  const edges: WorkflowGraphEdge[] = graph.edges
    .flatMap((edge, index) => {
      if (
        typeof edge.source !== "string" ||
        edge.source.length === 0 ||
        typeof edge.target !== "string" ||
        edge.target.length === 0
      ) {
        return [];
      }

      const branch = resolveReferenceEdgeBranch({
        edge,
        sourceNodeKind: sourceNodeKind.get(edge.source),
      });

      return [
        {
          id:
            typeof edge.id === "string" && edge.id.length > 0
              ? edge.id
              : `edge_${index + 1}`,
          source: edge.source,
          target: edge.target,
          ...(branch ? { branch } : {}),
        },
      ];
    })
    .toSorted((left, right) => left.id.localeCompare(right.id));

  return workflowGraphDocumentSchema.parse({
    schemaVersion: 1,
    trigger: mapReferenceTriggerToCanonical(triggerConfig),
    nodes,
    edges,
  });
}

function mapCanonicalTriggerToReference(
  trigger: WorkflowGraphDocument["trigger"],
): Record<string, unknown> {
  if (!trigger || trigger.type === "domain_event") {
    const startEvents =
      trigger && trigger.type === "domain_event"
        ? (trigger.startEvents ?? [])
        : [DEFAULT_DOMAIN_EVENT_START_EVENT];
    const restartEvents =
      trigger && trigger.type === "domain_event"
        ? (trigger.restartEvents ?? [])
        : [];
    const stopEvents =
      trigger && trigger.type === "domain_event"
        ? (trigger.stopEvents ?? [])
        : [];

    return {
      triggerType: "Webhook",
      domain:
        trigger?.type === "domain_event"
          ? trigger.domain
          : DEFAULT_DOMAIN_EVENT_TRIGGER_DOMAIN,
      webhookEventPath: DEFAULT_WEBHOOK_EVENT_PATH,
      webhookCorrelationPath: DEFAULT_WEBHOOK_CORRELATION_PATH,
      webhookCreateEvents: toCsvSet(startEvents),
      webhookUpdateEvents: toCsvSet(restartEvents),
      webhookDeleteEvents: toCsvSet(stopEvents),
    };
  }

  return {
    triggerType: "Schedule",
    scheduleExpression: trigger.expression,
    scheduleCron: trigger.expression,
    scheduleTimezone: trigger.timezone,
  };
}

function createReferenceActionNode(
  node: WorkflowGraphNode,
  index: number,
): ReferenceWorkflowNode {
  const position = { x: 260 * (index + 1), y: 80 };

  if (node.kind === "wait") {
    return {
      id: node.id,
      type: "action",
      position,
      data: {
        type: "action",
        label: "Wait",
        description: "Delay execution",
        enabled: true,
        status: "idle",
        config: {
          actionType: "Wait",
          waitDuration: node.wait.duration,
          duration: node.wait.duration,
          ...(node.wait.referenceField
            ? { referenceField: node.wait.referenceField }
            : {}),
          ...(node.wait.offsetDirection
            ? { offsetDirection: node.wait.offsetDirection }
            : {}),
        },
      },
    };
  }

  if (node.kind === "condition") {
    return {
      id: node.id,
      type: "action",
      position,
      data: {
        type: "action",
        label: "Condition",
        description: "Branch based on a condition",
        enabled: true,
        status: "idle",
        config: {
          actionType: "Condition",
          guard: node.guard,
        },
      },
    };
  }

  return {
    id: node.id,
    type: "action",
    position,
    data: {
      type: "action",
      label: node.actionId,
      description: "",
      enabled: true,
      status: "idle",
      config: {
        actionType: node.actionId,
        actionId: node.actionId,
        input: node.input ?? {},
        ...(node.guard ? { guard: node.guard } : {}),
      },
    },
  };
}

function mapCanonicalEdgesToReference(
  edges: WorkflowGraphEdge[],
  nodes: WorkflowGraphNode[],
): ReferenceWorkflowEdge[] {
  const nodeKindById = new Map<string, WorkflowGraphNode["kind"]>(
    nodes.map((node) => [node.id, node.kind]),
  );

  return edges
    .map((edge) => {
      const sourceKind = nodeKindById.get(edge.source);
      const shouldOmitTrueBranch =
        sourceKind === "condition" &&
        (edge.branch === undefined || edge.branch === "true");

      if (shouldOmitTrueBranch) {
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
        };
      }

      if (edge.branch) {
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          data: { branch: edge.branch },
        };
      }

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
      };
    })
    .toSorted((left, right) => left.id.localeCompare(right.id));
}

export function canonicalGraphToReferenceGraph(
  graph: WorkflowGraphDocument,
): ReferenceWorkflowGraph {
  const canonicalGraph = workflowGraphDocumentSchema.parse(graph);
  const triggerNode: ReferenceWorkflowNode = {
    id: DEFAULT_TRIGGER_NODE_ID,
    type: "trigger",
    position: { x: 0, y: 80 },
    data: {
      type: "trigger",
      label: "",
      description: "",
      status: "idle",
      enabled: true,
      config: mapCanonicalTriggerToReference(canonicalGraph.trigger),
    },
  };

  const canonicalNodes = [...canonicalGraph.nodes].toSorted((left, right) =>
    left.id.localeCompare(right.id),
  );

  const actionNodes = canonicalNodes.map((node, index) =>
    createReferenceActionNode(node, index),
  );

  const edges = mapCanonicalEdgesToReference(
    canonicalGraph.edges,
    canonicalNodes,
  );

  return {
    nodes: [triggerNode, ...actionNodes],
    edges,
  };
}

export function adaptCanonicalCatalogToReferenceCatalog(
  catalog: WorkflowCatalogResponse,
): ReferenceWorkflowCatalog {
  const canonicalCatalog = workflowCatalogResponseSchema.parse(catalog);
  const domainTriggers = canonicalCatalog.triggers.filter(
    (
      trigger,
    ): trigger is Extract<
      (typeof catalog.triggers)[number],
      { type: "domain_event" }
    > => trigger.type === "domain_event",
  );
  const scheduleTrigger = canonicalCatalog.triggers.find(
    (
      trigger,
    ): trigger is Extract<
      (typeof catalog.triggers)[number],
      { type: "schedule" }
    > => trigger.type === "schedule",
  );

  const triggerTypes: ReferenceTriggerCatalog[] = [];

  if (domainTriggers.length > 0) {
    triggerTypes.push({
      id: "Webhook",
      label: "Webhook",
      defaultEventPath: DEFAULT_WEBHOOK_EVENT_PATH,
      defaultCorrelationPath: DEFAULT_WEBHOOK_CORRELATION_PATH,
      domains: domainTriggers
        .map((trigger) => ({
          domain: trigger.domain,
          startEvents: [...trigger.defaultStartEvents],
          restartEvents: [...trigger.defaultRestartEvents],
          stopEvents: [...trigger.defaultStopEvents],
        }))
        .toSorted((left, right) => left.domain.localeCompare(right.domain)),
    });
  }

  triggerTypes.push({
    id: "Schedule",
    label: scheduleTrigger?.label ?? "Schedule",
    defaultTimezone:
      scheduleTrigger?.defaultTimezone ?? DEFAULT_SCHEDULE_TIMEZONE,
  });

  return {
    triggerTypes,
    actions: canonicalCatalog.actions.map((action) => ({
      id: action.id,
      label: action.label,
      description: action.description,
      category: action.category,
      configFields: action.configFields,
      outputFields: action.outputFields,
    })),
  };
}

export function mapCanonicalRunStatusToReferenceRunStatus(
  status: WorkflowRunStatus,
): ReferenceRunStatus {
  switch (status) {
    case "pending":
      return "pending";
    case "running":
      return "running";
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "cancelled":
      return "cancelled";
    default:
      return "error";
  }
}
