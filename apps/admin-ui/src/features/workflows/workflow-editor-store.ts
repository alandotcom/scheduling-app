import {
  journeyTriggerConfigSchema,
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
import { getAction } from "./action-registry";
import {
  getActionDefaultNodeLabel,
  isDefaultActionNodeLabel,
  isGenericActionNodeLabel,
} from "./action-visuals";

export type WorkflowCanvasNode = Node;
export type WorkflowCanvasEdge = Edge;

type WorkflowGraphState = {
  nodes: WorkflowCanvasNode[];
  edges: WorkflowCanvasEdge[];
};

const supportedJourneyActionTypes = new Set([
  "wait",
  "send-resend",
  "send-slack",
  "condition",
  "logger",
]);

type ConditionBranch = "true" | "false";

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

function getConditionBranchLabel(branch: ConditionBranch): string {
  return branch === "true" ? "True" : "False";
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

    return withoutConditionBranchData(edge);
  });
}

function resolveReconnectCandidate(input: {
  currentEdges: WorkflowCanvasEdge[];
  selectedEdgeId: string | null;
  connection: Connection;
}): WorkflowCanvasEdge | undefined {
  const selectedEdge = input.selectedEdgeId
    ? input.currentEdges.find((edge) => edge.id === input.selectedEdgeId)
    : undefined;

  const existingIncomingEdges = input.currentEdges.filter(
    (edge) => edge.target === input.connection.target,
  );
  const incomingReconnectCandidate =
    existingIncomingEdges.length === 1 ? existingIncomingEdges[0] : undefined;

  const selectedReconnectCandidate =
    selectedEdge !== undefined &&
    selectedEdge.target === input.connection.target;

  return selectedReconnectCandidate ? selectedEdge : incomingReconnectCandidate;
}

function filterEdgesForConnection(input: {
  edges: WorkflowCanvasEdge[];
  sourceNodeId: string;
  targetNodeId: string;
  normalizedConnection: Connection;
  reconnectEdgeId?: string;
  nodes: WorkflowCanvasNode[];
}): WorkflowCanvasEdge[] {
  const sourceNode = getNodeById(input.nodes, input.sourceNodeId);
  const sourceIsCondition = isConditionNode(sourceNode);
  const branch = normalizeConditionBranch(
    input.normalizedConnection.sourceHandle,
  );

  return input.edges.filter((edge) => {
    if (input.reconnectEdgeId && edge.id === input.reconnectEdgeId) {
      return true;
    }

    if (edge.target === input.targetNodeId) {
      return false;
    }

    if (edge.source !== input.sourceNodeId) {
      return true;
    }

    if (!sourceIsCondition) {
      return false;
    }

    const edgeBranch = normalizeConditionBranch(edge.sourceHandle);
    if (!edgeBranch || !branch) {
      return false;
    }

    return edgeBranch !== branch;
  });
}

function getCanonicalTriggerConfig() {
  return journeyTriggerConfigSchema.parse({
    triggerType: "AppointmentJourney",
    start: "appointment.scheduled",
    restart: "appointment.rescheduled",
    stop: "appointment.canceled",
    correlationKey: "appointmentId",
  });
}

function normalizeNodeData(data: unknown): Record<string, unknown> {
  const nodeData = asRecord(data);
  if (!nodeData || nodeData.type !== "trigger") {
    return nodeData ?? {};
  }

  return {
    ...nodeData,
    config: {
      ...getCanonicalTriggerConfig(),
      ...(asRecord(nodeData.config)?.filter
        ? { filter: asRecord(nodeData.config)?.filter }
        : {}),
    },
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

export const workflowEditorNodesAtom = atom<WorkflowCanvasNode[]>([]);
export const workflowEditorEdgesAtom = atom<WorkflowCanvasEdge[]>([]);
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
export type WorkflowExecutionNodeLogPreview = {
  nodeId: string;
  status: "pending" | "running" | "success" | "error" | "cancelled";
  input?: unknown;
  startedAt?: string | Date;
};
export const workflowExecutionLogsByNodeIdAtom = atom<
  Record<string, WorkflowExecutionNodeLogPreview>
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
    set(workflowEditorNodesAtom, nodes);
    set(workflowEditorEdgesAtom, edges);
    set(workflowEditorHasUnsavedChangesAtom, false);
    set(workflowEditorIsLoadedAtom, true);
    set(workflowEditorSelectedNodeIdAtom, null);
    set(workflowEditorSelectedEdgeIdAtom, null);
    set(selectedExecutionIdAtom, null);
    set(workflowExecutionLogsByNodeIdAtom, {});
    set(historyAtom, []);
    set(futureAtom, []);
  },
);

export const setWorkflowEditorSelectionAtom = atom(
  null,
  (
    _get,
    set,
    selection: {
      nodeId: string | null;
      edgeId: string | null;
    },
  ) => {
    set(workflowEditorSelectedNodeIdAtom, selection.nodeId);
    set(workflowEditorSelectedEdgeIdAtom, selection.edgeId);
  },
);

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

    const nextNodes = get(workflowEditorNodesAtom).map((node) => {
      if (node.id !== input.id) return node;

      return {
        ...node,
        data: {
          ...(typeof node.data === "object" && node.data !== null
            ? node.data
            : {}),
          ...input.data,
        },
      };
    });

    set(workflowEditorNodesAtom, nextNodes);
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

    set(workflowEditorNodesAtom, nextNodes);
    set(workflowEditorEdgesAtom, nextEdges);
    set(workflowEditorHasUnsavedChangesAtom, true);
  },
);

export const onWorkflowEditorEdgesChangeAtom = atom(
  null,
  (get, set, changes: EdgeChange[]) => {
    if (get(workflowEditorIsReadOnlyAtom)) return;

    const currentEdges = get(workflowEditorEdgesAtom);
    const nextEdges = applyEdgeChanges(changes, currentEdges);
    set(workflowEditorEdgesAtom, nextEdges);
    set(workflowEditorHasUnsavedChangesAtom, true);
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

    const reconnectCandidate = resolveReconnectCandidate({
      currentEdges,
      selectedEdgeId: get(workflowEditorSelectedEdgeIdAtom),
      connection: normalizedConnection,
    });

    const edgesWithoutConflicts = filterEdgesForConnection({
      edges: currentEdges,
      sourceNodeId,
      targetNodeId,
      normalizedConnection,
      reconnectEdgeId: reconnectCandidate?.id,
      nodes: currentNodes,
    });

    const nextEdges = reconnectCandidate
      ? reconnectEdge(
          reconnectCandidate,
          normalizedConnection,
          edgesWithoutConflicts,
          {
            shouldReplaceId: false,
          },
        )
      : addEdge(
          {
            ...normalizedConnection,
            id: nanoid(),
            animated: true,
          },
          edgesWithoutConflicts,
        );

    set(
      workflowEditorEdgesAtom,
      normalizeEdgesForRouting(nextEdges, currentNodes),
    );
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
      sourceNodeId,
      targetNodeId,
      normalizedConnection,
      reconnectEdgeId: input.oldEdge.id,
      nodes: currentNodes,
    });

    const nextEdges = reconnectEdge(
      input.oldEdge,
      normalizedConnection,
      edgesWithoutConflicts,
      { shouldReplaceId: false },
    );

    set(
      workflowEditorEdgesAtom,
      normalizeEdgesForRouting(nextEdges, currentNodes),
    );
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
      config: getCanonicalTriggerConfig(),
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
