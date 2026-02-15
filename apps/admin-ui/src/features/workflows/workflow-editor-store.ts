import {
  serializedWorkflowGraphSchema,
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

export function deserializeWorkflowGraph(
  graph: SerializedWorkflowGraph,
): WorkflowGraphState {
  const nodes = graph.nodes.map((node) => ({
    ...node.attributes,
    id: node.attributes.id,
    position: node.attributes.position ?? { x: 0, y: 0 },
    data: node.attributes.data,
  })) as WorkflowCanvasNode[];

  const edges = graph.edges.map((edge) => ({
    ...edge.attributes,
    id: edge.attributes.id,
    source: edge.source,
    target: edge.target,
  })) as WorkflowCanvasEdge[];

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
    const filteredChanges = changes.filter((change) => {
      if (change.type !== "remove") return true;
      const node = currentNodes.find((candidate) => candidate.id === change.id);
      return node?.data.type !== "trigger";
    });

    const nextNodes = applyNodeChanges(filteredChanges, currentNodes);
    set(workflowEditorNodesAtom, nextNodes);
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

// Delete atoms
export const deleteNodeAtom = atom(null, (get, set, nodeId: string) => {
  const currentNodes = get(workflowEditorNodesAtom);
  const nodeToDelete = currentNodes.find((node) => node.id === nodeId);
  if (nodeToDelete?.data.type === "trigger") return;

  const currentEdges = get(workflowEditorEdgesAtom);
  const history = get(historyAtom);
  set(historyAtom, [...history, { nodes: currentNodes, edges: currentEdges }]);
  set(futureAtom, []);

  set(
    workflowEditorNodesAtom,
    currentNodes.filter((n) => n.id !== nodeId),
  );
  set(
    workflowEditorEdgesAtom,
    currentEdges.filter((e) => e.source !== nodeId && e.target !== nodeId),
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
      config: {
        triggerType: "DomainEvent",
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
