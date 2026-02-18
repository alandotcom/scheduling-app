import dagre from "@dagrejs/dagre";
import type {
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
} from "./workflow-editor-store";

const DEFAULT_NODE_WIDTH = 176;
const DEFAULT_NODE_HEIGHT = 176;
const LAYOUT_DIRECTION = "LR";
const NODE_SPACING = 80;
const RANK_SPACING = 140;
const GRAPH_MARGIN = 24;

type NodeDimensions = {
  width: number;
  height: number;
};

type DagreNode = {
  x: number;
  y: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getNodeDimensions(_node: WorkflowCanvasNode): NodeDimensions {
  return {
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
  };
}

function hasPositionChanged(
  current: WorkflowCanvasNode["position"],
  next: WorkflowCanvasNode["position"],
): boolean {
  return current.x !== next.x || current.y !== next.y;
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return items.toSorted((a, b) => a.id.localeCompare(b.id));
}

function getEdgeWeight(edge: WorkflowCanvasEdge): number {
  if (edge.sourceHandle === "true") {
    return 3;
  }

  if (edge.sourceHandle === "false") {
    return 2;
  }

  return 1;
}

function getLayoutNode(
  graph: dagre.graphlib.Graph,
  nodeId: string,
): DagreNode | null {
  const candidate = graph.node(nodeId);
  if (!isRecord(candidate)) {
    return null;
  }

  const { x, y } = candidate;
  if (typeof x !== "number" || typeof y !== "number") {
    return null;
  }

  return { x, y };
}

export function layoutWorkflowNodes(input: {
  nodes: WorkflowCanvasNode[];
  edges: WorkflowCanvasEdge[];
}): {
  nodes: WorkflowCanvasNode[];
  changed: boolean;
} {
  const graph = new dagre.graphlib.Graph({
    directed: true,
    multigraph: false,
    compound: false,
  });

  graph.setGraph({
    rankdir: LAYOUT_DIRECTION,
    align: "UL",
    nodesep: NODE_SPACING,
    ranksep: RANK_SPACING,
    marginx: GRAPH_MARGIN,
    marginy: GRAPH_MARGIN,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  const sortedNodes = sortById(input.nodes);
  const nodeMap = new Map(sortedNodes.map((node) => [node.id, node]));

  for (const node of sortedNodes) {
    const { width, height } = getNodeDimensions(node);
    graph.setNode(node.id, { width, height });
  }

  for (const edge of sortById(input.edges)) {
    if (!(nodeMap.has(edge.source) && nodeMap.has(edge.target))) {
      continue;
    }

    graph.setEdge(edge.source, edge.target, {
      weight: getEdgeWeight(edge),
    });
  }

  dagre.layout(graph);

  let changed = false;

  const nextNodes = input.nodes.map((node) => {
    const layoutNode = getLayoutNode(graph, node.id);
    if (!layoutNode) {
      return node;
    }

    const dimensions = getNodeDimensions(node);
    const nextPosition = {
      x: Math.round(layoutNode.x - dimensions.width / 2),
      y: Math.round(layoutNode.y - dimensions.height / 2),
    };

    if (!hasPositionChanged(node.position, nextPosition)) {
      return node;
    }

    changed = true;

    return {
      ...node,
      position: nextPosition,
    };
  });

  return { nodes: nextNodes, changed };
}
