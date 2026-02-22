import {
  isJourneyActionAllowedForTriggerType,
  journeyTriggerConfigSchema,
  journeyTriggerFilterAstSchema,
  type JourneyTriggerConfig,
  type JourneyMode,
  serializedJourneyGraphSchema,
  type SerializedJourneyGraph,
} from "@scheduling/dto";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  reconnectEdge,
} from "@xyflow/react";
import { atom } from "jotai";
import { nanoid } from "nanoid";
import { getAction, getRegisteredActionIds } from "./action-registry";
import {
  getActionDefaultNodeLabel,
  isDefaultActionNodeLabel,
  isGenericActionNodeLabel,
} from "./action-visuals";

type ConditionBranch = "true" | "false";
type TriggerBranch = "scheduled" | "canceled" | "no_show";
type WorkflowTriggerBranchNodeLike = {
  id: string;
  data: unknown;
};
type WorkflowTriggerBranchEdgeLike = {
  source: string;
  target: string;
  sourceHandle?: unknown;
  label?: unknown;
  data?: unknown;
};

export const DISALLOWED_ACTION_TYPES_ON_TERMINAL_TRIGGER_BRANCH = [
  "wait",
  "wait-for-confirmation",
] as const;
const disallowedActionTypesOnTerminalTriggerBranch = new Set<string>(
  DISALLOWED_ACTION_TYPES_ON_TERMINAL_TRIGGER_BRANCH,
);
const terminalTriggerBranches = new Set<TriggerBranch>(["canceled", "no_show"]);

export type WorkflowNodeStatus =
  | "idle"
  | "running"
  | "success"
  | "error"
  | "cancelled";

export type WorkflowTriggerNodeData = {
  type: "trigger";
  label?: string;
  description?: string;
  status?: WorkflowNodeStatus;
  config?: {
    triggerType?: JourneyTriggerConfig["triggerType"];
    start?: "appointment.scheduled";
    restart?: "appointment.rescheduled";
    stop?: "appointment.canceled";
    event?: "client.created" | "client.updated";
    trackedAttributeKey?: string;
    correlationKey?: string;
    filter?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type WorkflowActionNodeData = {
  type: "action";
  label?: string;
  description?: string;
  status?: WorkflowNodeStatus;
  enabled?: boolean;
  config?: {
    actionType?: string;
    waitDelayTimingMode?: string;
    waitDuration?: unknown;
    waitUntil?: unknown;
    waitOffset?: unknown;
    waitTimezone?: unknown;
    waitAllowedHoursMode?: unknown;
    waitAllowedStartTime?: unknown;
    waitAllowedEndTime?: unknown;
    expression?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type WorkflowAddNodeData = {
  type: "add";
  label?: string;
  onClick?: () => void;
  [key: string]: unknown;
};

type WorkflowGenericNodeData = {
  type?: string;
  label?: string;
  description?: string;
  status?: WorkflowNodeStatus;
  enabled?: boolean;
  config?: Record<string, unknown>;
  onClick?: () => void;
  [key: string]: unknown;
};

export type WorkflowNodeData =
  | WorkflowTriggerNodeData
  | WorkflowActionNodeData
  | WorkflowAddNodeData
  | WorkflowGenericNodeData;

export type WorkflowEdgeData = {
  conditionBranch?: ConditionBranch;
  triggerBranch?: TriggerBranch;
  branch?: string;
  switchBranch?: string;
  [key: string]: unknown;
};

export type WorkflowCanvasNode = Node<WorkflowNodeData>;
export type WorkflowCanvasEdge = Edge<WorkflowEdgeData>;

export type WorkflowGraphState = {
  nodes: WorkflowCanvasNode[];
  edges: WorkflowCanvasEdge[];
};

export type PersistableWorkflowGraphResult = {
  graph: SerializedJourneyGraph;
  skippedNodeIds: string[];
};

const supportedJourneyActionTypes = new Set(getRegisteredActionIds());

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return true;
}

function isSupportedJourneyActionType(value: string): boolean {
  return supportedJourneyActionTypes.has(value);
}

function getNormalizedActionTypeFromNode(
  node: WorkflowCanvasNode,
): string | null {
  const nodeData = asRecord(node.data);
  if (nodeData?.type !== "action") {
    return null;
  }

  const config = asRecord(nodeData.config);
  if (typeof config?.actionType !== "string") {
    return null;
  }

  const actionType = config.actionType.trim().toLowerCase();
  if (actionType.length === 0) {
    return null;
  }

  return actionType;
}

function isIncompleteActionNode(node: WorkflowCanvasNode): boolean {
  const nodeData = asRecord(node.data);
  if (nodeData?.type !== "action") {
    return false;
  }

  const actionType = getNormalizedActionTypeFromNode(node);
  if (!actionType || !isSupportedJourneyActionType(actionType)) {
    return true;
  }

  if (actionType !== "condition") {
    return false;
  }

  const config = asRecord(nodeData.config);
  return !(
    typeof config?.expression === "string" &&
    config.expression.trim().length > 0
  );
}

function collectReachableNodeIds(input: {
  nodes: WorkflowCanvasNode[];
  edges: WorkflowCanvasEdge[];
}): Set<string> {
  const triggerNodeIds = input.nodes
    .filter((node) => asRecord(node.data)?.type === "trigger")
    .map((node) => node.id);
  const edgesBySourceId = new Map<string, WorkflowCanvasEdge[]>();
  for (const edge of input.edges) {
    const existing = edgesBySourceId.get(edge.source) ?? [];
    existing.push(edge);
    edgesBySourceId.set(edge.source, existing);
  }

  const reachableNodeIds = new Set<string>();
  const stack = [...triggerNodeIds];
  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (!nodeId || reachableNodeIds.has(nodeId)) {
      continue;
    }

    reachableNodeIds.add(nodeId);
    const outgoingEdges = edgesBySourceId.get(nodeId) ?? [];
    for (const edge of outgoingEdges) {
      stack.push(edge.target);
    }
  }

  return reachableNodeIds;
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

  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[\s-]+/g, "_");
  if (
    normalized === "scheduled" ||
    normalized === "canceled" ||
    normalized === "no_show"
  ) {
    return normalized;
  }

  if (normalized === "noshow") {
    return "no_show";
  }

  return null;
}

function getTriggerBranchFromEdgeLike(
  edge: WorkflowTriggerBranchEdgeLike,
): TriggerBranch | null {
  const edgeData = asRecord(edge.data);
  const dataBranch = normalizeTriggerBranch(edgeData?.["triggerBranch"]);
  if (dataBranch) {
    return dataBranch;
  }

  const labelBranch = normalizeTriggerBranch(edge.label);
  if (labelBranch) {
    return labelBranch;
  }

  return normalizeTriggerBranch(edge.sourceHandle);
}

export function getTriggerBranchFromEdge(
  edge: WorkflowCanvasEdge,
): TriggerBranch | null {
  return getTriggerBranchFromEdgeLike(edge);
}

function getTriggerNodeId(
  nodes: readonly WorkflowTriggerBranchNodeLike[],
): string | null {
  const triggerNode = nodes.find(
    (node) => asRecord(node.data)?.type === "trigger",
  );
  if (!triggerNode) {
    return null;
  }

  return triggerNode.id;
}

export function getNodeIdsOnTerminalTriggerBranch(input: {
  nodes: readonly WorkflowTriggerBranchNodeLike[];
  edges: readonly WorkflowTriggerBranchEdgeLike[];
}): Set<string> {
  const triggerNodeId = getTriggerNodeId(input.nodes);
  if (!triggerNodeId) {
    return new Set<string>();
  }

  const terminalBranchStartNodeIds = input.edges
    .filter((edge) => {
      if (edge.source !== triggerNodeId) {
        return false;
      }

      const branch = getTriggerBranchFromEdgeLike(edge);
      return branch ? terminalTriggerBranches.has(branch) : false;
    })
    .map((edge) => edge.target);

  if (terminalBranchStartNodeIds.length === 0) {
    return new Set<string>();
  }

  const edgesBySource = new Map<string, WorkflowTriggerBranchEdgeLike[]>();
  for (const edge of input.edges) {
    const sourceEdges = edgesBySource.get(edge.source) ?? [];
    sourceEdges.push(edge);
    edgesBySource.set(edge.source, sourceEdges);
  }

  const terminalPathNodeIds = new Set<string>();
  const stack = [...terminalBranchStartNodeIds];
  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (!nodeId || terminalPathNodeIds.has(nodeId)) {
      continue;
    }

    terminalPathNodeIds.add(nodeId);
    const outgoingEdges = edgesBySource.get(nodeId) ?? [];
    for (const edge of outgoingEdges) {
      stack.push(edge.target);
    }
  }

  return terminalPathNodeIds;
}

export function isNodeOnTerminalTriggerBranch(input: {
  nodeId: string;
  nodes: readonly WorkflowTriggerBranchNodeLike[];
  edges: readonly WorkflowTriggerBranchEdgeLike[];
}): boolean {
  return getNodeIdsOnTerminalTriggerBranch(input).has(input.nodeId);
}

function collectConditionBranches(
  edges: WorkflowCanvasEdge[],
  sourceNodeId: string,
): Set<ConditionBranch> {
  const branches = new Set<ConditionBranch>();

  for (const edge of edges) {
    if (edge.source !== sourceNodeId) {
      continue;
    }

    const branch = normalizeConditionBranch(edge.sourceHandle);
    if (branch) {
      branches.add(branch);
    }
  }

  return branches;
}

function collectTriggerBranches(
  edges: WorkflowCanvasEdge[],
  sourceNodeId: string,
): Set<TriggerBranch> {
  const branches = new Set<TriggerBranch>();

  for (const edge of edges) {
    if (edge.source !== sourceNodeId) {
      continue;
    }

    const branch = getTriggerBranchFromEdge(edge);
    if (branch) {
      branches.add(branch);
    }
  }

  return branches;
}

function resolveConditionBranchForConnection(input: {
  sourceNodeId: string;
  connection: Connection;
  currentEdges: WorkflowCanvasEdge[];
}): ConditionBranch | null {
  const explicitBranch = normalizeConditionBranch(
    input.connection.sourceHandle,
  );
  if (explicitBranch) {
    return explicitBranch;
  }

  const existingBranches = collectConditionBranches(
    input.currentEdges,
    input.sourceNodeId,
  );

  if (!existingBranches.has("true")) {
    return "true";
  }

  if (!existingBranches.has("false")) {
    return "false";
  }

  return "true";
}

function resolveTriggerBranchForConnection(input: {
  sourceNodeId: string;
  connection: Connection;
  currentEdges: WorkflowCanvasEdge[];
}): TriggerBranch | null {
  const explicitBranch = normalizeTriggerBranch(input.connection.sourceHandle);
  if (explicitBranch) {
    return explicitBranch;
  }

  const existingBranches = collectTriggerBranches(
    input.currentEdges,
    input.sourceNodeId,
  );

  if (!existingBranches.has("scheduled")) {
    return "scheduled";
  }

  if (!existingBranches.has("canceled")) {
    return "canceled";
  }

  if (!existingBranches.has("no_show")) {
    return "no_show";
  }

  return "scheduled";
}

function getConditionBranchLabel(branch: ConditionBranch): string {
  return branch === "true" ? "True" : "False";
}

function getTriggerBranchLabel(branch: TriggerBranch): string {
  if (branch === "scheduled") {
    return "Scheduled";
  }

  if (branch === "canceled") {
    return "Canceled";
  }

  return "No Show";
}

function isClientJourneyTriggerConfig(config: JourneyTriggerConfig): boolean {
  return config.triggerType === "ClientJourney";
}

function getClientJourneyEntryLabel(config: JourneyTriggerConfig): string {
  if (
    config.triggerType === "ClientJourney" &&
    config.event === "client.updated"
  ) {
    return "Updated";
  }

  return "Created";
}

function normalizeTriggerEdgesForNode(input: {
  triggerNodeId: string;
  triggerConfig: JourneyTriggerConfig;
  edges: WorkflowCanvasEdge[];
}): WorkflowCanvasEdge[] {
  const outgoingEdges = input.edges.filter(
    (edge) => edge.source === input.triggerNodeId,
  );
  if (outgoingEdges.length === 0) {
    return input.edges;
  }

  if (isClientJourneyTriggerConfig(input.triggerConfig)) {
    const preferredEdge =
      outgoingEdges.find(
        (edge) => getTriggerBranchFromEdge(edge) === "scheduled",
      ) ??
      outgoingEdges.find((edge) => getTriggerBranchFromEdge(edge) === null) ??
      outgoingEdges[0];

    if (!preferredEdge) {
      return input.edges;
    }

    const normalizedEdge = {
      ...withTriggerBranchData(preferredEdge, "scheduled"),
      label: getClientJourneyEntryLabel(input.triggerConfig),
    };

    return input.edges.flatMap((edge) => {
      if (edge.source !== input.triggerNodeId) {
        return [edge];
      }

      if (edge.id !== preferredEdge.id) {
        return [];
      }

      return [normalizedEdge];
    });
  }

  const usedBranches = new Set<TriggerBranch>();
  const branchByEdgeId = new Map<string, TriggerBranch>();

  for (const edge of outgoingEdges) {
    const existingBranch = getTriggerBranchFromEdge(edge);
    if (!existingBranch || usedBranches.has(existingBranch)) {
      continue;
    }

    usedBranches.add(existingBranch);
    branchByEdgeId.set(edge.id, existingBranch);
  }

  for (const edge of outgoingEdges) {
    if (branchByEdgeId.has(edge.id)) {
      continue;
    }

    const nextBranch = !usedBranches.has("scheduled")
      ? "scheduled"
      : !usedBranches.has("canceled")
        ? "canceled"
        : !usedBranches.has("no_show")
          ? "no_show"
          : "scheduled";
    usedBranches.add(nextBranch);
    branchByEdgeId.set(edge.id, nextBranch);
  }

  return input.edges.map((edge) => {
    if (edge.source !== input.triggerNodeId) {
      return edge;
    }

    const branch = branchByEdgeId.get(edge.id);
    if (!branch) {
      return edge;
    }

    return withTriggerBranchData(edge, branch);
  });
}

function normalizeTriggerEdgesForConfigs(input: {
  nodes: WorkflowCanvasNode[];
  edges: WorkflowCanvasEdge[];
}): WorkflowCanvasEdge[] {
  let nextEdges = input.edges;

  for (const node of input.nodes) {
    const nodeData = asRecord(node.data);
    if (nodeData?.type !== "trigger") {
      continue;
    }

    const triggerConfig = normalizeTriggerConfig(nodeData.config);
    nextEdges = normalizeTriggerEdgesForNode({
      triggerNodeId: node.id,
      triggerConfig,
      edges: nextEdges,
    });
  }

  return nextEdges;
}

function normalizeWorkflowGraphForEditor(
  input: WorkflowGraphState,
): WorkflowGraphState {
  const normalizedEdges = normalizeEdgesForRouting(input.edges, input.nodes);
  const triggerNormalizedEdges = normalizeTriggerEdgesForConfigs({
    nodes: input.nodes,
    edges: normalizedEdges,
  });

  return {
    nodes: input.nodes,
    edges: triggerNormalizedEdges,
  };
}

function isConditionLabel(value: unknown): boolean {
  return normalizeConditionBranch(value) !== null;
}

function getNodeById(
  nodes: WorkflowCanvasNode[],
  nodeId: string,
): WorkflowCanvasNode | undefined {
  return nodes.find((node) => node.id === nodeId);
}

function isTriggerNode(node: WorkflowCanvasNode | undefined): boolean {
  if (!node) {
    return false;
  }

  return asRecord(node.data)?.type === "trigger";
}

function isConditionNode(node: WorkflowCanvasNode | undefined): boolean {
  if (!node) {
    return false;
  }

  const nodeData = asRecord(node.data);
  if (nodeData?.type !== "action") {
    return false;
  }

  const config = asRecord(nodeData.config);
  if (typeof config?.actionType !== "string") {
    return false;
  }

  return config.actionType.trim().toLowerCase() === "condition";
}

function withConditionBranchData(
  edge: WorkflowCanvasEdge,
  branch: ConditionBranch,
): WorkflowCanvasEdge {
  const edgeData = asRecord(edge.data) ?? {};
  return {
    ...edge,
    sourceHandle: branch,
    label: getConditionBranchLabel(branch),
    data: {
      ...edgeData,
      conditionBranch: branch,
    },
  };
}

function withoutConditionBranchData(
  edge: WorkflowCanvasEdge,
): WorkflowCanvasEdge {
  const edgeData = asRecord(edge.data);
  const nextData = edgeData ? { ...edgeData } : undefined;
  if (nextData) {
    delete nextData.conditionBranch;
    delete nextData.branch;
  }

  const hasData = nextData && Object.keys(nextData).length > 0;

  return {
    ...edge,
    sourceHandle: null,
    label: isConditionLabel(edge.label) ? undefined : edge.label,
    ...(hasData ? { data: nextData } : { data: undefined }),
  };
}

function withTriggerBranchData(
  edge: WorkflowCanvasEdge,
  branch: TriggerBranch,
): WorkflowCanvasEdge {
  const edgeData = asRecord(edge.data) ?? {};
  return {
    ...edge,
    sourceHandle: branch,
    label: getTriggerBranchLabel(branch),
    data: {
      ...edgeData,
      triggerBranch: branch,
    },
  };
}

function normalizeConnectionForSource(input: {
  sourceNodeId: string;
  connection: Connection;
  sourceNode: WorkflowCanvasNode | undefined;
  currentEdges: WorkflowCanvasEdge[];
}): Connection | null {
  if (isConditionNode(input.sourceNode)) {
    const branch = resolveConditionBranchForConnection({
      sourceNodeId: input.sourceNodeId,
      connection: input.connection,
      currentEdges: input.currentEdges,
    });
    if (!branch) {
      return null;
    }

    return {
      ...input.connection,
      sourceHandle: branch,
    };
  }

  if (isTriggerNode(input.sourceNode)) {
    const branch = resolveTriggerBranchForConnection({
      sourceNodeId: input.sourceNodeId,
      connection: input.connection,
      currentEdges: input.currentEdges,
    });
    if (!branch) {
      return null;
    }

    return {
      ...input.connection,
      sourceHandle: branch,
    };
  }

  return {
    ...input.connection,
    sourceHandle: null,
  };
}

function normalizeEdgesForRouting(
  edges: WorkflowCanvasEdge[],
  nodes: WorkflowCanvasNode[],
): WorkflowCanvasEdge[] {
  return edges.map((edge) => {
    const sourceNode = getNodeById(nodes, edge.source);
    if (isConditionNode(sourceNode)) {
      const branch = normalizeConditionBranch(edge.sourceHandle);
      if (branch) {
        return withConditionBranchData(edge, branch);
      }
      return edge;
    }

    if (isTriggerNode(sourceNode)) {
      const branch = getTriggerBranchFromEdge(edge);
      if (branch) {
        return withTriggerBranchData(edge, branch);
      }
      return edge;
    }

    return withoutConditionBranchData(edge);
  });
}

function filterEdgesForConnection(input: {
  edges: WorkflowCanvasEdge[];
  targetNodeId: string;
  reconnectEdgeId?: string;
}): WorkflowCanvasEdge[] {
  return input.edges.filter((edge) => {
    if (input.reconnectEdgeId && edge.id === input.reconnectEdgeId) {
      return true;
    }

    return edge.target !== input.targetNodeId;
  });
}

export function getDefaultAppointmentTriggerConfig() {
  return journeyTriggerConfigSchema.parse({
    triggerType: "AppointmentJourney",
    start: "appointment.scheduled",
    restart: "appointment.rescheduled",
    stop: "appointment.canceled",
    correlationKey: "appointmentId",
  });
}

export function getDefaultClientTriggerConfig() {
  return journeyTriggerConfigSchema.parse({
    triggerType: "ClientJourney",
    event: "client.created",
    correlationKey: "clientId",
  });
}

function normalizeTriggerConfig(value: unknown): JourneyTriggerConfig {
  const parsed = journeyTriggerConfigSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  const config = asRecord(value);
  const parsedFilter = journeyTriggerFilterAstSchema.safeParse(config?.filter);
  const isClientJourney = config?.triggerType === "ClientJourney";
  const baseConfig = isClientJourney
    ? getDefaultClientTriggerConfig()
    : getDefaultAppointmentTriggerConfig();
  return {
    ...baseConfig,
    ...(parsedFilter.success ? { filter: parsedFilter.data } : {}),
  };
}

function getTriggerTypeFromNodes(
  nodes: WorkflowCanvasNode[],
): JourneyTriggerConfig["triggerType"] | null {
  const triggerNode = nodes.find(
    (node) => asRecord(node.data)?.type === "trigger",
  );
  if (!triggerNode) {
    return null;
  }

  const triggerData = asRecord(triggerNode.data);
  const triggerConfig = asRecord(triggerData?.config);
  if (triggerConfig?.triggerType === "ClientJourney") {
    return "ClientJourney";
  }

  return "AppointmentJourney";
}

function normalizeNodeData(data: unknown): Record<string, unknown> {
  const nodeData = asRecord(data);
  if (!nodeData || nodeData.type !== "trigger") {
    return nodeData ?? {};
  }

  return {
    ...nodeData,
    config: normalizeTriggerConfig(nodeData.config),
  };
}

export function deserializeWorkflowGraph(
  graph: SerializedJourneyGraph,
): WorkflowGraphState {
  const nodes: WorkflowCanvasNode[] = graph.nodes.map((node) => ({
    ...node.attributes,
    id: node.attributes.id,
    position: node.attributes.position ?? { x: 0, y: 0 },
    data: normalizeNodeData(node.attributes.data),
  }));

  const edges: WorkflowCanvasEdge[] = graph.edges.map((edge) => ({
    ...edge.attributes,
    id: edge.attributes.id,
    source: edge.source,
    target: edge.target,
  }));

  return {
    nodes,
    edges,
  };
}

export function serializeWorkflowGraph(
  state: WorkflowGraphState,
): SerializedJourneyGraph {
  return serializedJourneyGraphSchema.parse({
    attributes: {},
    options: { type: "directed", allowSelfLoops: false, multi: false },
    nodes: state.nodes.map((node) => ({
      key: node.id,
      attributes: {
        id: node.id,
        type: typeof node.type === "string" ? node.type : undefined,
        position: node.position,
        data: node.data,
      },
    })),
    edges: state.edges.map((edge) => ({
      key: edge.id,
      source: edge.source,
      target: edge.target,
      undirected: false,
      attributes: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: typeof edge.type === "string" ? edge.type : undefined,
        ...(typeof edge.sourceHandle === "string" &&
        edge.sourceHandle.length > 0
          ? { sourceHandle: edge.sourceHandle }
          : {}),
        ...(typeof edge.targetHandle === "string" &&
        edge.targetHandle.length > 0
          ? { targetHandle: edge.targetHandle }
          : {}),
        ...(typeof edge.label === "string" && edge.label.trim().length > 0
          ? { label: edge.label }
          : {}),
        ...(asRecord(edge.data) ? { data: edge.data } : {}),
      },
    })),
  });
}

function getPersistableGraphFingerprint(input: WorkflowGraphState): string {
  return JSON.stringify(serializeWorkflowGraph(input));
}

function didPersistableGraphChange(input: {
  previous: WorkflowGraphState;
  next: WorkflowGraphState;
}): boolean {
  return (
    getPersistableGraphFingerprint(input.previous) !==
    getPersistableGraphFingerprint(input.next)
  );
}

export function buildPersistableWorkflowGraph(
  state: WorkflowGraphState,
): PersistableWorkflowGraphResult {
  const skippedNodeIds = new Set<string>();
  let nextNodes = [...state.nodes];
  let nextEdges = [...state.edges];

  while (true) {
    const nodeIds = new Set(nextNodes.map((node) => node.id));
    nextEdges = nextEdges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
    );

    const incomingByNodeId = new Map<string, number>();
    for (const node of nextNodes) {
      incomingByNodeId.set(node.id, 0);
    }
    for (const edge of nextEdges) {
      incomingByNodeId.set(
        edge.target,
        (incomingByNodeId.get(edge.target) ?? 0) + 1,
      );
    }

    const reachableNodeIds = collectReachableNodeIds({
      nodes: nextNodes,
      edges: nextEdges,
    });
    const removeNodeIds = new Set<string>();

    for (const node of nextNodes) {
      const nodeData = asRecord(node.data);
      if (isIncompleteActionNode(node)) {
        removeNodeIds.add(node.id);
        continue;
      }

      if (nodeData?.type === "trigger") {
        continue;
      }

      if ((incomingByNodeId.get(node.id) ?? 0) !== 1) {
        removeNodeIds.add(node.id);
        continue;
      }

      if (!reachableNodeIds.has(node.id)) {
        removeNodeIds.add(node.id);
      }
    }

    if (removeNodeIds.size === 0) {
      break;
    }

    for (const nodeId of removeNodeIds) {
      skippedNodeIds.add(nodeId);
    }

    nextNodes = nextNodes.filter((node) => !removeNodeIds.has(node.id));
    const remainingNodeIds = new Set(nextNodes.map((node) => node.id));
    nextEdges = nextEdges.filter(
      (edge) =>
        remainingNodeIds.has(edge.source) && remainingNodeIds.has(edge.target),
    );
  }

  return {
    graph: serializeWorkflowGraph({ nodes: nextNodes, edges: nextEdges }),
    skippedNodeIds: [...skippedNodeIds],
  };
}

export const workflowEditorNodesAtom = atom<WorkflowCanvasNode[]>([]);
export const workflowEditorEdgesAtom = atom<WorkflowCanvasEdge[]>([]);
export const workflowExecutionViewGraphAtom = atom<WorkflowGraphState | null>(
  null,
);
export const isExecutionViewActiveAtom = atom(
  (get) => get(workflowExecutionViewGraphAtom) !== null,
);
export const workflowActiveCanvasNodesAtom = atom((get) => {
  const executionViewGraph = get(workflowExecutionViewGraphAtom);
  return executionViewGraph?.nodes ?? get(workflowEditorNodesAtom);
});
export const workflowActiveCanvasEdgesAtom = atom((get) => {
  const executionViewGraph = get(workflowExecutionViewGraphAtom);
  return executionViewGraph?.edges ?? get(workflowEditorEdgesAtom);
});
export const workflowEditorIsReadOnlyAtom = atom(true);
export const workflowEditorHasUnsavedChangesAtom = atom(false);
export const workflowEditorIsSavingAtom = atom(false);
export const workflowEditorIsLoadedAtom = atom(false);
export const workflowEditorWorkflowIdAtom = atom<string | null>(null);
export const workflowEditorSelectedNodeIdAtom = atom<string | null>(null);
export const workflowEditorSelectedEdgeIdAtom = atom<string | null>(null);

// Sidebar/Panel State
export const rightPanelWidthAtom = atom<string | null>(null);
export const isSidebarCollapsedAtom = atom(false);
export const propertiesPanelActiveTabAtom = atom<string>("properties");

// Execution State
export const isExecutingAtom = atom(false);
export const selectedExecutionIdAtom = atom<string | null>(null);
export const workflowEditorJourneyModeAtom = atom<JourneyMode>("live");
export type WorkflowExecutionNodeLogPreview = {
  nodeId: string;
  status: "pending" | "running" | "success" | "error" | "cancelled";
  input?: unknown;
  output?: unknown;
  waitUntil?: string | Date;
  error?: string | null;
  startedAt?: string | Date;
};
export const workflowExecutionLogsByNodeIdAtom = atom<
  Record<string, WorkflowExecutionNodeLogPreview>
>({});
export type WorkflowExecutionEdgeStatus = "default" | "active" | "traversed";
export const workflowExecutionEdgeStatusByEdgeIdAtom = atom<
  Record<string, WorkflowExecutionEdgeStatus>
>({});

// Undo/Redo System
type HistoryState = {
  nodes: WorkflowCanvasNode[];
  edges: WorkflowCanvasEdge[];
};

const historyAtom = atom<HistoryState[]>([]);
const futureAtom = atom<HistoryState[]>([]);

export const undoAtom = atom(null, (get, set) => {
  const history = get(historyAtom);
  if (history.length === 0) return;
  const currentNodes = get(workflowEditorNodesAtom);
  const currentEdges = get(workflowEditorEdgesAtom);
  const future = get(futureAtom);
  set(futureAtom, [...future, { nodes: currentNodes, edges: currentEdges }]);
  const newHistory = [...history];
  const previousState = newHistory.pop()!;
  set(historyAtom, newHistory);
  set(workflowEditorNodesAtom, previousState.nodes);
  set(workflowEditorEdgesAtom, previousState.edges);
  set(workflowEditorHasUnsavedChangesAtom, true);
});

export const redoAtom = atom(null, (get, set) => {
  const future = get(futureAtom);
  if (future.length === 0) return;
  const currentNodes = get(workflowEditorNodesAtom);
  const currentEdges = get(workflowEditorEdgesAtom);
  const history = get(historyAtom);
  set(historyAtom, [...history, { nodes: currentNodes, edges: currentEdges }]);
  const newFuture = [...future];
  const nextState = newFuture.pop()!;
  set(futureAtom, newFuture);
  set(workflowEditorNodesAtom, nextState.nodes);
  set(workflowEditorEdgesAtom, nextState.edges);
  set(workflowEditorHasUnsavedChangesAtom, true);
});

export const canUndoAtom = atom((get) => get(historyAtom).length > 0);
export const canRedoAtom = atom((get) => get(futureAtom).length > 0);

export const setWorkflowEditorGraphAtom = atom(
  null,
  (_get, set, graph: SerializedJourneyGraph) => {
    const { nodes, edges } = deserializeWorkflowGraph(graph);
    const normalizedGraph = normalizeWorkflowGraphForEditor({ nodes, edges });
    set(workflowEditorNodesAtom, normalizedGraph.nodes);
    set(workflowEditorEdgesAtom, normalizedGraph.edges);
    set(workflowEditorHasUnsavedChangesAtom, false);
    set(workflowEditorIsLoadedAtom, true);
    set(workflowEditorSelectedNodeIdAtom, null);
    set(workflowEditorSelectedEdgeIdAtom, null);
    set(workflowExecutionViewGraphAtom, null);
    set(selectedExecutionIdAtom, null);
    set(workflowExecutionLogsByNodeIdAtom, {});
    set(workflowExecutionEdgeStatusByEdgeIdAtom, {});
    set(historyAtom, []);
    set(futureAtom, []);
  },
);

export const setWorkflowEditorSelectionAtom = atom(
  null,
  (
    get,
    set,
    selection: {
      nodeId: string | null;
      edgeId: string | null;
    },
  ) => {
    const currentSelectedNodeId = get(workflowEditorSelectedNodeIdAtom);
    const currentSelectedEdgeId = get(workflowEditorSelectedEdgeIdAtom);
    if (
      currentSelectedNodeId === selection.nodeId &&
      currentSelectedEdgeId === selection.edgeId
    ) {
      return;
    }

    if (currentSelectedNodeId !== selection.nodeId) {
      set(workflowEditorSelectedNodeIdAtom, selection.nodeId);
    }
    if (currentSelectedEdgeId !== selection.edgeId) {
      set(workflowEditorSelectedEdgeIdAtom, selection.edgeId);
    }
  },
);

export const clearWorkflowEditorSelectionAtom = atom(null, (get, set) => {
  const currentNodes = get(workflowEditorNodesAtom);
  const currentEdges = get(workflowEditorEdgesAtom);
  const currentSelectedNodeId = get(workflowEditorSelectedNodeIdAtom);
  const currentSelectedEdgeId = get(workflowEditorSelectedEdgeIdAtom);

  let nodesChanged = false;
  const nextNodes = currentNodes.map((node) => {
    if (node.selected !== true) {
      return node;
    }
    nodesChanged = true;
    return {
      ...node,
      selected: false,
    };
  });

  let edgesChanged = false;
  const nextEdges = currentEdges.map((edge) => {
    if (edge.selected !== true) {
      return edge;
    }
    edgesChanged = true;
    return {
      ...edge,
      selected: false,
    };
  });

  if (
    !nodesChanged &&
    !edgesChanged &&
    !currentSelectedNodeId &&
    !currentSelectedEdgeId
  ) {
    return;
  }

  if (nodesChanged) {
    set(workflowEditorNodesAtom, nextNodes);
  }
  if (edgesChanged) {
    set(workflowEditorEdgesAtom, nextEdges);
  }
  if (currentSelectedNodeId) {
    set(workflowEditorSelectedNodeIdAtom, null);
  }
  if (currentSelectedEdgeId) {
    set(workflowEditorSelectedEdgeIdAtom, null);
  }
});

export const updateWorkflowEditorNodeDataAtom = atom(
  null,
  (
    get,
    set,
    input: {
      id: string;
      data: Record<string, unknown>;
    },
  ) => {
    if (get(workflowEditorIsReadOnlyAtom)) return;

    const currentNodes = get(workflowEditorNodesAtom);
    const currentEdges = get(workflowEditorEdgesAtom);
    const nextNodes = currentNodes.map((node) => {
      if (node.id !== input.id) return node;

      const nextNodeData = normalizeNodeData({
        ...(typeof node.data === "object" && node.data !== null
          ? node.data
          : {}),
        ...input.data,
      });

      return {
        ...node,
        data: nextNodeData,
      };
    });

    const updatedNode = getNodeById(nextNodes, input.id);
    const nextEdges = isTriggerNode(updatedNode)
      ? normalizeWorkflowGraphForEditor({
          nodes: nextNodes,
          edges: currentEdges,
        }).edges
      : currentEdges;

    set(workflowEditorNodesAtom, nextNodes);
    set(workflowEditorEdgesAtom, nextEdges);
    set(workflowEditorHasUnsavedChangesAtom, true);
  },
);

export const onWorkflowEditorNodesChangeAtom = atom(
  null,
  (get, set, changes: NodeChange[]) => {
    if (get(workflowEditorIsReadOnlyAtom)) return;

    const currentNodes = get(workflowEditorNodesAtom);
    const currentEdges = get(workflowEditorEdgesAtom);
    const filteredChanges = changes.filter((change) => {
      if (change.type !== "remove") return true;
      const node = currentNodes.find((candidate) => candidate.id === change.id);

      if (node?.data.type === "trigger") {
        return false;
      }

      return true;
    });

    const nextNodes = applyNodeChanges(filteredChanges, currentNodes);
    const nextNodeIds = new Set(nextNodes.map((node) => node.id));
    const nextEdges = currentEdges.filter(
      (edge) => nextNodeIds.has(edge.source) && nextNodeIds.has(edge.target),
    );
    const hasPersistableChange = didPersistableGraphChange({
      previous: { nodes: currentNodes, edges: currentEdges },
      next: { nodes: nextNodes, edges: nextEdges },
    });

    set(workflowEditorNodesAtom, nextNodes);
    set(workflowEditorEdgesAtom, nextEdges);
    if (hasPersistableChange) {
      set(workflowEditorHasUnsavedChangesAtom, true);
    }
  },
);

export const onWorkflowEditorEdgesChangeAtom = atom(
  null,
  (get, set, changes: EdgeChange[]) => {
    if (get(workflowEditorIsReadOnlyAtom)) return;

    const currentEdges = get(workflowEditorEdgesAtom);
    const nextEdges = applyEdgeChanges(changes, currentEdges);
    const hasPersistableChange = didPersistableGraphChange({
      previous: {
        nodes: get(workflowEditorNodesAtom),
        edges: currentEdges,
      },
      next: {
        nodes: get(workflowEditorNodesAtom),
        edges: nextEdges,
      },
    });
    set(workflowEditorEdgesAtom, nextEdges);
    if (hasPersistableChange) {
      set(workflowEditorHasUnsavedChangesAtom, true);
    }
  },
);

export const onWorkflowEditorConnectAtom = atom(
  null,
  (get, set, connection: Connection) => {
    if (get(workflowEditorIsReadOnlyAtom)) return;

    const currentNodes = get(workflowEditorNodesAtom);
    const currentEdges = get(workflowEditorEdgesAtom);
    const sourceNodeId = connection.source;
    const targetNodeId = connection.target;
    if (!sourceNodeId || !targetNodeId) {
      return;
    }

    const targetNode = getNodeById(currentNodes, targetNodeId);
    if (isTriggerNode(targetNode)) {
      return;
    }

    const sourceNode = getNodeById(currentNodes, sourceNodeId);
    const normalizedConnection = normalizeConnectionForSource({
      sourceNodeId,
      connection,
      sourceNode,
      currentEdges,
    });
    if (!normalizedConnection) {
      return;
    }

    const edgesWithoutConflicts = filterEdgesForConnection({
      edges: currentEdges,
      targetNodeId,
    });

    const nextEdges = addEdge(
      {
        ...normalizedConnection,
        id: nanoid(),
        animated: true,
      },
      edgesWithoutConflicts,
    );

    const normalizedGraph = normalizeWorkflowGraphForEditor({
      nodes: currentNodes,
      edges: nextEdges,
    });
    set(workflowEditorEdgesAtom, normalizedGraph.edges);
    set(workflowEditorHasUnsavedChangesAtom, true);
  },
);

export const onWorkflowEditorReconnectAtom = atom(
  null,
  (
    get,
    set,
    input: {
      oldEdge: WorkflowCanvasEdge;
      newConnection: Connection;
    },
  ) => {
    if (get(workflowEditorIsReadOnlyAtom)) return;

    const currentNodes = get(workflowEditorNodesAtom);
    const currentEdges = get(workflowEditorEdgesAtom);
    const sourceNodeId = input.newConnection.source;
    const targetNodeId = input.newConnection.target;
    if (!(sourceNodeId && targetNodeId)) {
      return;
    }

    const targetNode = getNodeById(currentNodes, targetNodeId);
    if (isTriggerNode(targetNode)) {
      return;
    }

    const sourceNode = getNodeById(currentNodes, sourceNodeId);
    const normalizedConnection = normalizeConnectionForSource({
      sourceNodeId,
      connection: input.newConnection,
      sourceNode,
      currentEdges,
    });
    if (!normalizedConnection) {
      return;
    }

    const edgesWithoutConflicts = filterEdgesForConnection({
      edges: currentEdges,
      targetNodeId,
      reconnectEdgeId: input.oldEdge.id,
    });

    const nextEdges = reconnectEdge(
      input.oldEdge,
      normalizedConnection,
      edgesWithoutConflicts,
      { shouldReplaceId: false },
    );

    const normalizedGraph = normalizeWorkflowGraphForEditor({
      nodes: currentNodes,
      edges: nextEdges,
    });
    set(workflowEditorEdgesAtom, normalizedGraph.edges);
    set(workflowEditorHasUnsavedChangesAtom, true);
  },
);

export const addWorkflowEditorNodeAtom = atom(
  null,
  (get, set, node: WorkflowCanvasNode) => {
    if (get(workflowEditorIsReadOnlyAtom)) return;

    const currentNodes = get(workflowEditorNodesAtom);
    const currentEdges = get(workflowEditorEdgesAtom);
    const history = get(historyAtom);
    set(historyAtom, [
      ...history,
      { nodes: currentNodes, edges: currentEdges },
    ]);
    set(futureAtom, []);

    set(workflowEditorNodesAtom, [...currentNodes, node]);
    set(workflowEditorSelectedNodeIdAtom, node.id);
    set(workflowEditorSelectedEdgeIdAtom, null);
    set(workflowEditorHasUnsavedChangesAtom, true);
  },
);

export const addWorkflowEditorActionNodeAtom = atom(null, (get, set) => {
  if (get(workflowEditorIsReadOnlyAtom)) return;

  const currentNodes = get(workflowEditorNodesAtom);
  const currentEdges = get(workflowEditorEdgesAtom);
  const history = get(historyAtom);
  set(historyAtom, [...history, { nodes: currentNodes, edges: currentEdges }]);
  set(futureAtom, []);

  const actionNodesCount = currentNodes.filter(
    (node) => node.data.type === "action",
  ).length;

  const nextNode: WorkflowCanvasNode = {
    id: nanoid(),
    type: "action",
    position: {
      x: 420,
      y: 160 + actionNodesCount * 130,
    },
    data: {
      type: "action",
      label: `Action ${actionNodesCount + 1}`,
      status: "idle",
      config: {},
    },
  };

  set(workflowEditorNodesAtom, [...currentNodes, nextNode]);
  set(workflowEditorHasUnsavedChangesAtom, true);
});

export const setWorkflowEditorActionTypeAtom = atom(
  null,
  (get, set, input: { nodeId: string; actionType: string }) => {
    if (get(workflowEditorIsReadOnlyAtom)) return;
    if (!isSupportedJourneyActionType(input.actionType)) return;

    const currentNodes = get(workflowEditorNodesAtom);
    const currentEdges = get(workflowEditorEdgesAtom);
    const triggerType = getTriggerTypeFromNodes(currentNodes);
    if (!isJourneyActionAllowedForTriggerType(input.actionType, triggerType)) {
      return;
    }

    const normalizedActionType = input.actionType.trim().toLowerCase();
    if (
      disallowedActionTypesOnTerminalTriggerBranch.has(normalizedActionType) &&
      isNodeOnTerminalTriggerBranch({
        nodeId: input.nodeId,
        nodes: currentNodes,
        edges: currentEdges,
      })
    ) {
      return;
    }
    const history = get(historyAtom);
    set(historyAtom, [
      ...history,
      { nodes: currentNodes, edges: currentEdges },
    ]);
    set(futureAtom, []);

    const nextNodes = currentNodes.map((node) => {
      if (node.id !== input.nodeId) {
        return node;
      }

      const nodeData = asRecord(node.data) ?? {};
      const currentConfig = asRecord(nodeData.config) ?? {};
      const currentLabel =
        typeof nodeData.label === "string" ? nodeData.label : "";
      const shouldApplyDefaultLabel =
        currentLabel.trim().length === 0 ||
        isGenericActionNodeLabel(currentLabel) ||
        isDefaultActionNodeLabel(currentLabel);
      const action = getAction(input.actionType);
      const nextLabel = shouldApplyDefaultLabel
        ? (getActionDefaultNodeLabel(input.actionType) ??
          action?.label ??
          currentLabel)
        : currentLabel;

      return {
        ...node,
        data: {
          ...nodeData,
          label: nextLabel,
          config: {
            ...currentConfig,
            actionType: input.actionType,
            ...(input.actionType === "wait"
              ? {
                  waitDelayTimingMode:
                    typeof currentConfig.waitDelayTimingMode === "string"
                      ? currentConfig.waitDelayTimingMode
                      : "duration",
                }
              : {}),
            ...(input.actionType === "condition"
              ? {
                  expression:
                    typeof currentConfig.expression === "string" &&
                    currentConfig.expression.trim().length > 0
                      ? currentConfig.expression
                      : "true",
                }
              : {}),
          },
        },
      };
    });

    const firstOutgoingEdgeId = currentEdges.find(
      (edge) => edge.source === input.nodeId,
    )?.id;
    const nextEdges =
      input.actionType === "condition"
        ? currentEdges.map((edge) => {
            if (edge.source !== input.nodeId) {
              return edge;
            }

            if (firstOutgoingEdgeId === edge.id) {
              return withConditionBranchData(edge, "true");
            }

            return edge;
          })
        : currentEdges.filter((edge, index, edges) => {
            if (edge.source !== input.nodeId) {
              return true;
            }

            const firstOutgoingIndex = edges.findIndex(
              (candidate) => candidate.source === input.nodeId,
            );
            return index === firstOutgoingIndex;
          });

    set(workflowEditorNodesAtom, nextNodes);
    set(
      workflowEditorEdgesAtom,
      normalizeEdgesForRouting(nextEdges, nextNodes),
    );
    set(workflowEditorHasUnsavedChangesAtom, true);
  },
);

// Delete atoms
export const deleteNodeAtom = atom(null, (get, set, nodeId: string) => {
  const currentNodes = get(workflowEditorNodesAtom);
  const currentEdges = get(workflowEditorEdgesAtom);
  const nodeToDelete = currentNodes.find((node) => node.id === nodeId);
  if (nodeToDelete?.data.type === "trigger") return;
  const history = get(historyAtom);
  set(historyAtom, [...history, { nodes: currentNodes, edges: currentEdges }]);
  set(futureAtom, []);

  set(
    workflowEditorNodesAtom,
    currentNodes.filter((node) => node.id !== nodeId),
  );
  set(
    workflowEditorEdgesAtom,
    currentEdges.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId,
    ),
  );
  if (get(workflowEditorSelectedNodeIdAtom) === nodeId) {
    set(workflowEditorSelectedNodeIdAtom, null);
  }
  set(workflowEditorHasUnsavedChangesAtom, true);
});

export const addInitialTriggerNodeAtom = atom(null, (get, set) => {
  const currentNodes = get(workflowEditorNodesAtom);
  if (currentNodes.length > 0) return;

  const currentEdges = get(workflowEditorEdgesAtom);
  const history = get(historyAtom);
  set(historyAtom, [...history, { nodes: currentNodes, edges: currentEdges }]);
  set(futureAtom, []);

  const triggerNode: WorkflowCanvasNode = {
    id: "trigger-node",
    type: "trigger",
    position: { x: 140, y: 180 },
    data: {
      type: "trigger",
      label: "Trigger",
      status: "idle",
      config: getDefaultAppointmentTriggerConfig(),
    },
  };

  set(workflowEditorNodesAtom, [triggerNode]);
  set(workflowEditorSelectedNodeIdAtom, triggerNode.id);
  set(workflowEditorHasUnsavedChangesAtom, true);
});

export const deleteEdgeAtom = atom(null, (get, set, edgeId: string) => {
  const currentEdges = get(workflowEditorEdgesAtom);

  const history = get(historyAtom);
  set(historyAtom, [
    ...history,
    { nodes: get(workflowEditorNodesAtom), edges: currentEdges },
  ]);
  set(futureAtom, []);

  set(
    workflowEditorEdgesAtom,
    currentEdges.filter((e) => e.id !== edgeId),
  );
  if (get(workflowEditorSelectedEdgeIdAtom) === edgeId) {
    set(workflowEditorSelectedEdgeIdAtom, null);
  }
  set(workflowEditorHasUnsavedChangesAtom, true);
});
