import parseDuration from "parse-duration";
import type {
  WebhookEventType,
  WorkflowActionCatalogItem,
  WorkflowGuardCondition,
  WorkflowGraphDocument,
  WorkflowGraphEdge,
  WorkflowGraphNode,
} from "@scheduling/dto";
import type { Edge, Node } from "@xyflow/react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkflowBuilderNode = WorkflowGraphNode & {
  position?: { x?: number; y?: number };
};

export type TriggerCanvasNode = {
  id: typeof TRIGGER_NODE_ID;
  kind: "trigger";
  eventType: WebhookEventType;
};

export type CanvasGraphNode = WorkflowBuilderNode | TriggerCanvasNode;

export type BuilderNodeData = {
  graphNode: CanvasGraphNode;
  title: string;
  subtitle: string;
};

export type BuilderNode = Node<BuilderNodeData>;
export type BuilderEdge = Edge;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TRIGGER_NODE_ID = "__trigger__";
export const TRIGGER_EDGE_PREFIX = "__trigger_edge__";

export const NODE_TYPE_TRIGGER = "triggerNode" as const;
export const NODE_TYPE_ACTION = "actionNode" as const;
export const NODE_TYPE_WAIT = "waitNode" as const;
export const NODE_TYPE_CONDITION = "conditionNode" as const;
export const NODE_TYPE_TERMINAL = "terminalNode" as const;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isBuilderNodeData(value: unknown): value is BuilderNodeData {
  if (!isRecord(value)) return false;
  return (
    typeof value["title"] === "string" &&
    typeof value["subtitle"] === "string" &&
    isRecord(value["graphNode"]) &&
    typeof value["graphNode"]["id"] === "string" &&
    typeof value["graphNode"]["kind"] === "string"
  );
}

export function isWorkflowGraphNode(
  node: CanvasGraphNode,
): node is WorkflowBuilderNode {
  return node.kind !== "trigger";
}

// ---------------------------------------------------------------------------
// Node utilities
// ---------------------------------------------------------------------------

export function createNodeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function getActionLabel(
  actionId: string,
  actionCatalog: readonly WorkflowActionCatalogItem[],
): string {
  return (
    actionCatalog.find((action) => action.id === actionId)?.label ?? actionId
  );
}

export function getNodeTitle(
  node: CanvasGraphNode,
  actionCatalog: readonly WorkflowActionCatalogItem[],
): { title: string; subtitle: string } {
  if (node.kind === "trigger") {
    return { title: "Trigger", subtitle: node.eventType };
  }
  if (node.kind === "action") {
    return {
      title: getActionLabel(node.actionId, actionCatalog),
      subtitle: node.integrationKey,
    };
  }
  if (node.kind === "wait") {
    return { title: "Wait", subtitle: node.wait.duration };
  }
  if (node.kind === "condition") {
    const count = node.guard.conditions.length;
    return {
      title: "Condition",
      subtitle: `${count} rule${count !== 1 ? "s" : ""} (${node.guard.combinator})`,
    };
  }
  return {
    title: "Terminal",
    subtitle: node.terminalType === "cancel" ? "Cancel" : "Complete",
  };
}

export function resolveNodePosition(
  node: WorkflowBuilderNode,
  index: number,
): { x: number; y: number } {
  const pos = node.position;
  if (
    pos &&
    typeof pos.x === "number" &&
    Number.isFinite(pos.x) &&
    typeof pos.y === "number" &&
    Number.isFinite(pos.y)
  ) {
    return { x: pos.x, y: pos.y };
  }
  return {
    x: 80 + (index % 3) * 280,
    y: 80 + Math.floor(index / 3) * 240,
  };
}

function nodeKindToType(kind: CanvasGraphNode["kind"]): string {
  switch (kind) {
    case "trigger":
      return NODE_TYPE_TRIGGER;
    case "action":
      return NODE_TYPE_ACTION;
    case "wait":
      return NODE_TYPE_WAIT;
    case "condition":
      return NODE_TYPE_CONDITION;
    case "terminal":
      return NODE_TYPE_TERMINAL;
  }
}

export function createTriggerFlowNode(
  eventType: WebhookEventType,
): BuilderNode {
  const triggerNode: TriggerCanvasNode = {
    id: TRIGGER_NODE_ID,
    kind: "trigger",
    eventType,
  };
  const titles = getNodeTitle(triggerNode, []);
  return {
    id: TRIGGER_NODE_ID,
    type: NODE_TYPE_TRIGGER,
    draggable: false,
    deletable: false,
    position: { x: -260, y: 120 },
    data: {
      graphNode: triggerNode,
      title: titles.title,
      subtitle: titles.subtitle,
    },
  };
}

export function toFlowNode(
  node: WorkflowBuilderNode,
  index: number,
  actionCatalog: readonly WorkflowActionCatalogItem[],
): BuilderNode {
  const titles = getNodeTitle(node, actionCatalog);
  return {
    id: node.id,
    type: nodeKindToType(node.kind),
    position: resolveNodePosition(node, index),
    data: { graphNode: node, title: titles.title, subtitle: titles.subtitle },
  };
}

export function toFlowEdge(edge: WorkflowGraphEdge): BuilderEdge {
  const data = edge.branch ? { branch: edge.branch } : undefined;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle:
      edge.branch === "true" || edge.branch === "false" ? edge.branch : null,
    type: "animated",
    ...(data ? { data } : {}),
  };
}

export function toGraphNode(node: BuilderNode): WorkflowBuilderNode | null {
  const graphNode = node.data?.graphNode;
  if (!graphNode || !isWorkflowGraphNode(graphNode)) return null;
  return {
    ...graphNode,
    id: node.id,
    position: {
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
    },
  };
}

export function toGraphEdge(edge: BuilderEdge): WorkflowGraphEdge {
  const branch = isRecord(edge.data) ? edge.data["branch"] : undefined;
  const normalizedBranch =
    branch === "next" ||
    branch === "timeout" ||
    branch === "true" ||
    branch === "false"
      ? branch
      : undefined;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(normalizedBranch ? { branch: normalizedBranch } : {}),
  };
}

export function buildDocumentFromFlow(input: {
  currentDocument: WorkflowGraphDocument;
  flowNodes: BuilderNode[];
  flowEdges: BuilderEdge[];
}): WorkflowGraphDocument {
  const nextNodes = input.flowNodes
    .map((node) => toGraphNode(node))
    .filter((node): node is WorkflowBuilderNode => node !== null);

  const graphNodeIds = new Set(nextNodes.map((node) => node.id));
  const nextEdges = input.flowEdges
    .filter(
      (edge) =>
        edge.source !== TRIGGER_NODE_ID &&
        edge.target !== TRIGGER_NODE_ID &&
        graphNodeIds.has(edge.source) &&
        graphNodeIds.has(edge.target),
    )
    .map((edge) => toGraphEdge(edge));

  return { ...input.currentDocument, nodes: nextNodes, edges: nextEdges };
}

export function updateNodeGraphData(
  nodes: BuilderNode[],
  nodeId: string,
  updater: (node: WorkflowBuilderNode) => WorkflowBuilderNode,
  actionCatalog: readonly WorkflowActionCatalogItem[],
): BuilderNode[] {
  return nodes.map((node) => {
    if (node.id !== nodeId) return node;
    const currentGraphNode = node.data.graphNode;
    if (!isWorkflowGraphNode(currentGraphNode)) return node;
    const nextGraphNode = updater(currentGraphNode);
    const titles = getNodeTitle(nextGraphNode, actionCatalog);
    return {
      ...node,
      data: {
        graphNode: nextGraphNode,
        title: titles.title,
        subtitle: titles.subtitle,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Guard utilities
// ---------------------------------------------------------------------------

export const GUARD_OPERATORS: readonly WorkflowGuardCondition["operator"][] = [
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "in",
  "not_in",
  "exists",
  "not_exists",
];

export function isGuardOperator(
  value: string,
): value is WorkflowGuardCondition["operator"] {
  return GUARD_OPERATORS.some((op) => op === value);
}

export function createDefaultGuardCondition(): WorkflowGuardCondition {
  return { field: "id", operator: "eq", value: "" };
}

export function operatorNeedsValue(
  operator: WorkflowGuardCondition["operator"],
): boolean {
  return operator !== "exists" && operator !== "not_exists";
}

export function parseGuardScalar(input: string): unknown {
  const trimmed = input.trim();
  if (trimmed.length === 0) return "";
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return input;
  }
}

export function parseGuardValueInput(
  input: string,
  operator: WorkflowGuardCondition["operator"],
): unknown {
  if (!operatorNeedsValue(operator)) return undefined;
  if (operator === "in" || operator === "not_in") {
    return input
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0)
      .map((e) => parseGuardScalar(e));
  }
  return parseGuardScalar(input);
}

export function formatGuardScalar(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "bigint"
    ) {
      return String(value);
    }
    if (typeof value === "symbol") return value.description ?? "";
    return "";
  }
}

export function formatGuardValueInput(
  value: unknown,
  operator: WorkflowGuardCondition["operator"],
): string {
  if (!operatorNeedsValue(operator)) return "";
  if (operator === "in" || operator === "not_in") {
    if (!Array.isArray(value)) return "";
    return value.map((e) => formatGuardScalar(e)).join(", ");
  }
  return formatGuardScalar(value);
}

// ---------------------------------------------------------------------------
// Duration utilities
// ---------------------------------------------------------------------------

function normalizeIsoDurationForParse(value: string): string {
  if (!value.startsWith("P")) return value;
  const separatorIndex = value.indexOf("T");
  if (separatorIndex <= 1 || separatorIndex >= value.length - 1) return value;
  const dateChunk = value.slice(0, separatorIndex);
  const timeChunk = value.slice(separatorIndex + 1);
  return `${dateChunk} PT${timeChunk}`;
}

export function parseWorkflowDurationToMs(value: string): number | null {
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  const parsed = parseDuration(
    normalizeIsoDurationForParse(normalized.toUpperCase()),
  );
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

export function formatDurationMsAsIso8601(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.floor(durationMs / 1_000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0 && hours === 0 && minutes === 0 && seconds === 0) {
    return `P${days}D`;
  }
  const timeParts: string[] = [];
  if (hours > 0) timeParts.push(`${hours}H`);
  if (minutes > 0) timeParts.push(`${minutes}M`);
  if (seconds > 0 || timeParts.length === 0) timeParts.push(`${seconds}S`);
  return `P${days > 0 ? `${days}D` : ""}T${timeParts.join("")}`;
}

export function humanizeDuration(durationMs: number): string {
  const units = [
    { label: "day", ms: 86_400_000 },
    { label: "hour", ms: 3_600_000 },
    { label: "minute", ms: 60_000 },
    { label: "second", ms: 1_000 },
  ] as const;

  let remaining = durationMs;
  const parts: string[] = [];
  for (const unit of units) {
    const amount = Math.floor(remaining / unit.ms);
    if (amount <= 0) continue;
    parts.push(`${amount} ${unit.label}${amount === 1 ? "" : "s"}`);
    remaining -= amount * unit.ms;
    if (parts.length >= 2) break;
  }
  return parts.length === 0 ? `${Math.floor(durationMs)} ms` : parts.join(" ");
}

// ---------------------------------------------------------------------------
// Preview utilities
// ---------------------------------------------------------------------------

export function getPathValue(
  payload: Record<string, unknown>,
  path: string,
): unknown {
  const segments = path
    .split(".")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  let current: unknown = payload;
  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

export function toTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) return Math.floor(value);
    if (value > 1_000_000_000) return Math.floor(value * 1_000);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

export function formatAbsoluteDateTime(valueMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(valueMs));
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

export function parseInputJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function documentSignature(document: WorkflowGraphDocument): string {
  try {
    return JSON.stringify(document);
  } catch {
    return "";
  }
}
