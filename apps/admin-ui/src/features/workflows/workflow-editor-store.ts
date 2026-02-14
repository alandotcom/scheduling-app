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

export function createDefaultWorkflowGraph(): SerializedWorkflowGraph {
  return {
    attributes: {},
    options: { type: "directed", allowSelfLoops: false, multi: false },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
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
        },
      },
    ],
    edges: [],
  };
}

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

export const setWorkflowEditorGraphAtom = atom(
  null,
  (_get, set, graph: SerializedWorkflowGraph) => {
    const nextGraph =
      graph.nodes.length === 0 ? createDefaultWorkflowGraph() : graph;
    const { nodes, edges } = deserializeWorkflowGraph(nextGraph);
    set(workflowEditorNodesAtom, nodes);
    set(workflowEditorEdgesAtom, edges);
    set(workflowEditorHasUnsavedChangesAtom, false);
    set(workflowEditorIsLoadedAtom, true);
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
