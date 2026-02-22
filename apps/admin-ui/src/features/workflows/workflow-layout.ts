import dagre from "@dagrejs/dagre";
import { hierarchy, tree } from "d3-hierarchy";
import type {
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
} from "./workflow-editor-store";
import {
  WORKFLOW_NODE_HEIGHT,
  WORKFLOW_NODE_WIDTH,
} from "./workflow-node-dimensions";

const LAYOUT_DIRECTION = "TB";
const NODE_SPACING = 132;
const RANK_SPACING = 118;
const GRAPH_MARGIN = 40;
const ROOT_ID = "__workflow-root__";

type NodeDimensions = {
  width: number;
  height: number;
};

type DagreNode = {
  x: number;
  y: number;
};

type TreeNodeData = {
  id: string;
  children?: TreeNodeData[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getNodeDimensions(_node: WorkflowCanvasNode): NodeDimensions {
  return {
    width: WORKFLOW_NODE_WIDTH,
    height: WORKFLOW_NODE_HEIGHT,
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
  const sourceHandle = edge.sourceHandle?.trim().toLowerCase();
  if (sourceHandle === "true" || sourceHandle === "scheduled") {
    return 4;
  }

  if (sourceHandle === "false" || sourceHandle === "canceled") {
    return 3;
  }

  if (sourceHandle === "no_show") {
    return 2;
  }

  return 6;
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

function layoutWorkflowNodesWithDagre(input: {
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

function getTreeSortRank(sourceHandle: string | null | undefined): number {
  const normalizedHandle = sourceHandle?.trim().toLowerCase();
  if (normalizedHandle === "true" || normalizedHandle === "scheduled") {
    return 0;
  }

  if (normalizedHandle === "false" || normalizedHandle === "canceled") {
    return 1;
  }

  if (normalizedHandle === "no_show") {
    return 2;
  }

  return 3;
}

function buildTreeLayoutData(input: {
  nodes: WorkflowCanvasNode[];
  edges: WorkflowCanvasEdge[];
}): TreeNodeData | null {
  const nodeIds = new Set(input.nodes.map((node) => node.id));
  const inDegree = new Map<string, number>();
  const edgesBySource = new Map<string, WorkflowCanvasEdge[]>();

  for (const node of input.nodes) {
    inDegree.set(node.id, 0);
    edgesBySource.set(node.id, []);
  }

  for (const edge of input.edges) {
    if (!(nodeIds.has(edge.source) && nodeIds.has(edge.target))) {
      continue;
    }

    if (edge.source === edge.target) {
      return null;
    }

    edgesBySource.get(edge.source)?.push(edge);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);

    if ((inDegree.get(edge.target) ?? 0) > 1) {
      return null;
    }
  }

  for (const [sourceId, edges] of edgesBySource) {
    edgesBySource.set(
      sourceId,
      edges.toSorted((a, b) => {
        const rankDiff =
          getTreeSortRank(a.sourceHandle ?? null) -
          getTreeSortRank(b.sourceHandle ?? null);
        if (rankDiff !== 0) {
          return rankDiff;
        }

        return a.target.localeCompare(b.target);
      }),
    );
  }

  const roots = input.nodes
    .filter((node) => (inDegree.get(node.id) ?? 0) === 0)
    .toSorted((a, b) => a.id.localeCompare(b.id));

  if (roots.length === 0) {
    return null;
  }

  const seen = new Set<string>();
  const visitStack = new Set<string>();

  function buildNode(nodeId: string): TreeNodeData | null {
    if (visitStack.has(nodeId)) {
      return null;
    }

    visitStack.add(nodeId);
    seen.add(nodeId);

    const childEdges = edgesBySource.get(nodeId) ?? [];
    const children: TreeNodeData[] = [];

    for (const edge of childEdges) {
      const childNode = buildNode(edge.target);
      if (!childNode) {
        return null;
      }

      children.push(childNode);
    }

    visitStack.delete(nodeId);

    if (children.length === 0) {
      return { id: nodeId };
    }

    return { id: nodeId, children };
  }

  const rootChildren: TreeNodeData[] = [];
  for (const root of roots) {
    const built = buildNode(root.id);
    if (!built) {
      return null;
    }

    rootChildren.push(built);
  }

  if (seen.size !== input.nodes.length) {
    return null;
  }

  return {
    id: ROOT_ID,
    children: rootChildren,
  };
}

function layoutWorkflowNodesWithHierarchy(input: {
  nodes: WorkflowCanvasNode[];
  edges: WorkflowCanvasEdge[];
}): {
  nodes: WorkflowCanvasNode[];
  changed: boolean;
} | null {
  const treeData = buildTreeLayoutData({
    nodes: input.nodes,
    edges: input.edges,
  });

  if (!treeData) {
    return null;
  }

  const root = hierarchy(treeData, (node) => node.children ?? []);
  const treeLayout = tree<TreeNodeData>()
    .nodeSize([
      WORKFLOW_NODE_WIDTH + NODE_SPACING,
      WORKFLOW_NODE_HEIGHT + RANK_SPACING,
    ])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.4));

  treeLayout(root);

  const positionedDescendants = root
    .descendants()
    .filter((node) => node.data.id !== ROOT_ID);

  if (positionedDescendants.length === 0) {
    return { nodes: input.nodes, changed: false };
  }

  const topLeftById = new Map<string, { x: number; y: number }>();
  for (const descendant of positionedDescendants) {
    const centerX = descendant.x ?? 0;
    const centerY = descendant.y ?? 0;
    topLeftById.set(descendant.data.id, {
      x: centerX - WORKFLOW_NODE_WIDTH / 2,
      y: centerY - WORKFLOW_NODE_HEIGHT / 2,
    });
  }

  const topLeftPositions = Array.from(topLeftById.values());
  const minX = Math.min(...topLeftPositions.map((position) => position.x));
  const minY = Math.min(...topLeftPositions.map((position) => position.y));

  let changed = false;

  const nodes = input.nodes.map((node) => {
    const rawPosition = topLeftById.get(node.id);
    if (!rawPosition) {
      return node;
    }

    const nextPosition = {
      x: Math.round(rawPosition.x - minX + GRAPH_MARGIN),
      y: Math.round(rawPosition.y - minY + GRAPH_MARGIN),
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

  return { nodes, changed };
}

export async function layoutWorkflowNodes(input: {
  nodes: WorkflowCanvasNode[];
  edges: WorkflowCanvasEdge[];
  availableWidth?: number;
}): Promise<{
  nodes: WorkflowCanvasNode[];
  changed: boolean;
}> {
  if (input.nodes.length === 0) {
    return { nodes: input.nodes, changed: false };
  }

  const treeLayoutResult = layoutWorkflowNodesWithHierarchy({
    nodes: input.nodes,
    edges: input.edges,
  });

  if (treeLayoutResult) {
    return treeLayoutResult;
  }

  return layoutWorkflowNodesWithDagre({
    nodes: input.nodes,
    edges: input.edges,
  });
}
