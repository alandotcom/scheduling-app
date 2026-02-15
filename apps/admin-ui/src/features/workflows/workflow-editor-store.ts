import {
  domainEventDomains,
  serializedWorkflowGraphSchema,
  type DomainEventDomain,
  type SerializedWorkflowGraph,
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
} from "@xyflow/react";
import { atom } from "jotai";
import { nanoid } from "nanoid";

export type WorkflowCanvasNode = Node;
export type WorkflowCanvasEdge = Edge;

type WorkflowGraphState = {
  nodes: WorkflowCanvasNode[];
  edges: WorkflowCanvasEdge[];
};

type SwitchBranch = "created" | "updated" | "deleted";

const SWITCH_BRANCHES: Array<{ branch: SwitchBranch; label: string }> = [
  { branch: "created", label: "Created" },
  { branch: "updated", label: "Updated" },
  { branch: "deleted", label: "Deleted" },
];

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

function isSwitchBranch(value: unknown): value is SwitchBranch {
  return value === "created" || value === "updated" || value === "deleted";
}

function isDomainEventDomain(value: unknown): value is DomainEventDomain {
  return (
    typeof value === "string" &&
    domainEventDomains.some((domain) => domain === value)
  );
}

function toDomain(value: unknown): DomainEventDomain {
  return isDomainEventDomain(value) ? value : "appointment";
}

function getTriggerDomain(nodes: WorkflowCanvasNode[]): DomainEventDomain {
  const triggerNode = nodes.find((node) => {
    const data = asRecord(node.data);
    return data?.type === "trigger";
  });

  if (!triggerNode) {
    return "appointment";
  }

  const triggerData = asRecord(triggerNode.data);
  const triggerConfig = asRecord(triggerData?.config);
  return toDomain(triggerConfig?.domain);
}

function getSwitchBranchesForNode(
  edges: WorkflowCanvasEdge[],
  nodeId: string,
): Set<SwitchBranch> {
  const branches = new Set<SwitchBranch>();

  for (const edge of edges) {
    if (edge.source !== nodeId) {
      continue;
    }

    const edgeData = asRecord(edge.data);
    const branch = edgeData?.switchBranch;
    if (isSwitchBranch(branch)) {
      branches.add(branch);
    }
  }

  return branches;
}

function getSwitchCascadeNodeIds(
  nodes: WorkflowCanvasNode[],
  edges: WorkflowCanvasEdge[],
  rootNodeIds: Iterable<string>,
): Set<string> {
  const existingNodeIds = new Set(nodes.map((node) => node.id));
  const nodeIdsToDelete = new Set<string>();
  const queue: string[] = [];

  for (const nodeId of rootNodeIds) {
    if (!existingNodeIds.has(nodeId) || nodeIdsToDelete.has(nodeId)) {
      continue;
    }

    nodeIdsToDelete.add(nodeId);
    queue.push(nodeId);
  }

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (!currentNodeId) {
      continue;
    }

    for (const edge of edges) {
      if (edge.source !== currentNodeId) {
        continue;
      }

      const edgeData = asRecord(edge.data);
      if (!isSwitchBranch(edgeData?.switchBranch)) {
        continue;
      }

      if (
        !existingNodeIds.has(edge.target) ||
        nodeIdsToDelete.has(edge.target)
      ) {
        continue;
      }

      nodeIdsToDelete.add(edge.target);
      queue.push(edge.target);
    }
  }

  return nodeIdsToDelete;
}

function normalizeNodeData(data: unknown): Record<string, unknown> {
  const nodeData = asRecord(data);
  if (!nodeData || nodeData.type !== "trigger") {
    return nodeData ?? {};
  }

  const triggerConfig = asRecord(nodeData.config);
  if (!triggerConfig || triggerConfig.triggerType !== "DomainEvent") {
    return nodeData;
  }

  if (toDomain(triggerConfig.domain) === triggerConfig.domain) {
    return nodeData;
  }

  return {
    ...nodeData,
    config: {
      ...triggerConfig,
      domain: "appointment",
    },
  };
}

export function deserializeWorkflowGraph(
  graph: SerializedWorkflowGraph,
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
): SerializedWorkflowGraph {
  return serializedWorkflowGraphSchema.parse({
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
  (_get, set, graph: SerializedWorkflowGraph) => {
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
      return node?.data.type !== "trigger";
    });

    const removedNodeIds = new Set(
      filteredChanges
        .filter((change) => change.type === "remove")
        .map((change) => change.id),
    );

    const cascadedNodeIds = getSwitchCascadeNodeIds(
      currentNodes,
      currentEdges,
      removedNodeIds,
    );

    const additionalRemoveChanges: NodeChange[] = [...cascadedNodeIds]
      .filter((nodeId) => !removedNodeIds.has(nodeId))
      .map((nodeId) => ({ id: nodeId, type: "remove" }));

    const nextNodes = applyNodeChanges(
      [...filteredChanges, ...additionalRemoveChanges],
      currentNodes,
    );
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

    const currentEdges = get(workflowEditorEdgesAtom);
    const nextEdges = addEdge(
      {
        ...connection,
        id: nanoid(),
        animated: true,
      },
      currentEdges,
    );
    set(workflowEditorEdgesAtom, nextEdges);
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

      return {
        ...node,
        data: {
          ...nodeData,
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
          },
        },
      };
    });

    const nextEdges = [...currentEdges];
    const nextNodesWithBranches = [...nextNodes];

    if (input.actionType === "switch") {
      const existingBranches = getSwitchBranchesForNode(
        currentEdges,
        input.nodeId,
      );
      const triggerDomain = getTriggerDomain(nextNodes);
      const switchNode = nextNodes.find((node) => node.id === input.nodeId);

      const baseX = switchNode?.position.x ?? 0;
      const baseY = switchNode?.position.y ?? 0;

      for (const [index, branchDef] of SWITCH_BRANCHES.entries()) {
        if (existingBranches.has(branchDef.branch)) {
          continue;
        }

        const eventType = `${triggerDomain}.${branchDef.branch}`;
        const branchNodeId = nanoid();

        nextNodesWithBranches.push({
          id: branchNodeId,
          type: "action",
          position: {
            x: baseX + 320,
            y: baseY - 140 + index * 140,
          },
          data: {
            type: "action",
            label: `${branchDef.label} path`,
            description: `Actions for ${eventType}`,
            status: "idle",
            config: {},
          },
        });

        nextEdges.push({
          id: nanoid(),
          source: input.nodeId,
          target: branchNodeId,
          animated: true,
          label: branchDef.label,
          data: {
            switchBranch: branchDef.branch,
          },
        });
      }
    }

    set(workflowEditorNodesAtom, nextNodesWithBranches);
    set(workflowEditorEdgesAtom, nextEdges);
    set(workflowEditorHasUnsavedChangesAtom, true);
  },
);

// Delete atoms
export const deleteNodeAtom = atom(null, (get, set, nodeId: string) => {
  const currentNodes = get(workflowEditorNodesAtom);
  const nodeToDelete = currentNodes.find((node) => node.id === nodeId);
  if (nodeToDelete?.data.type === "trigger") return;

  const currentEdges = get(workflowEditorEdgesAtom);
  const nodeIdsToDelete = getSwitchCascadeNodeIds(currentNodes, currentEdges, [
    nodeId,
  ]);
  const history = get(historyAtom);
  set(historyAtom, [...history, { nodes: currentNodes, edges: currentEdges }]);
  set(futureAtom, []);

  set(
    workflowEditorNodesAtom,
    currentNodes.filter((n) => !nodeIdsToDelete.has(n.id)),
  );
  set(
    workflowEditorEdgesAtom,
    currentEdges.filter(
      (e) => !nodeIdsToDelete.has(e.source) && !nodeIdsToDelete.has(e.target),
    ),
  );
  if (nodeIdsToDelete.has(get(workflowEditorSelectedNodeIdAtom) ?? "")) {
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
      config: {
        triggerType: "DomainEvent",
        domain: "appointment",
        startEvents: [],
        restartEvents: [],
        stopEvents: [],
      },
    },
  };

  set(workflowEditorNodesAtom, [triggerNode]);
  set(workflowEditorSelectedNodeIdAtom, triggerNode.id);
  set(workflowEditorHasUnsavedChangesAtom, true);
});

export const deleteEdgeAtom = atom(null, (get, set, edgeId: string) => {
  const currentNodes = get(workflowEditorNodesAtom);
  const currentEdges = get(workflowEditorEdgesAtom);
  const history = get(historyAtom);
  set(historyAtom, [...history, { nodes: currentNodes, edges: currentEdges }]);
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
