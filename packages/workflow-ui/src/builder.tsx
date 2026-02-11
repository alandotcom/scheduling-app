// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  Handle,
  Position,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import type {
  WorkflowActionCatalogItem,
  WorkflowGuardCondition,
  WorkflowGraphDocument,
  WorkflowGraphEdge,
  WorkflowGraphNode,
} from "@scheduling/dto";
import { workflowGraphDocumentSchema } from "@scheduling/dto";

type WorkflowBuilderProps = {
  document: WorkflowGraphDocument;
  actionCatalog: readonly WorkflowActionCatalogItem[];
  onChange: (next: WorkflowGraphDocument) => void;
  readOnly?: boolean;
};

type WorkflowBuilderNode = WorkflowGraphNode & {
  position?: {
    x?: number;
    y?: number;
  };
};

type BuilderNodeData = {
  graphNode: WorkflowBuilderNode;
  title: string;
  subtitle: string;
};

type BuilderNode = Node<BuilderNodeData>;
type BuilderEdge = Edge;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBuilderNodeData(value: unknown): value is BuilderNodeData {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value["title"] === "string" &&
    typeof value["subtitle"] === "string" &&
    isRecord(value["graphNode"]) &&
    typeof value["graphNode"]["id"] === "string" &&
    typeof value["graphNode"]["kind"] === "string"
  );
}

function createNodeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const GUARD_OPERATORS: readonly WorkflowGuardCondition["operator"][] = [
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

function isGuardOperator(
  value: string,
): value is WorkflowGuardCondition["operator"] {
  return GUARD_OPERATORS.some((operator) => operator === value);
}

function createDefaultGuardCondition(): WorkflowGuardCondition {
  return {
    field: "id",
    operator: "eq",
    value: "",
  };
}

function operatorNeedsValue(
  operator: WorkflowGuardCondition["operator"],
): boolean {
  return operator !== "exists" && operator !== "not_exists";
}

function parseGuardScalar(input: string): unknown {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return "";
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return input;
  }
}

function parseGuardValueInput(
  input: string,
  operator: WorkflowGuardCondition["operator"],
): unknown {
  if (!operatorNeedsValue(operator)) {
    return undefined;
  }

  if (operator === "in" || operator === "not_in") {
    return input
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => parseGuardScalar(entry));
  }

  return parseGuardScalar(input);
}

function formatGuardScalar(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

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

    if (typeof value === "symbol") {
      return value.description ?? "";
    }

    return "";
  }
}

function formatGuardValueInput(
  value: unknown,
  operator: WorkflowGuardCondition["operator"],
): string {
  if (!operatorNeedsValue(operator)) {
    return "";
  }

  if (operator === "in" || operator === "not_in") {
    if (!Array.isArray(value)) {
      return "";
    }

    return value.map((entry) => formatGuardScalar(entry)).join(", ");
  }

  return formatGuardScalar(value);
}

function getActionLabel(
  actionId: string,
  actionCatalog: readonly WorkflowActionCatalogItem[],
): string {
  return (
    actionCatalog.find((action) => action.id === actionId)?.label ?? actionId
  );
}

function getNodeTitle(
  node: WorkflowBuilderNode,
  actionCatalog: readonly WorkflowActionCatalogItem[],
): { title: string; subtitle: string } {
  if (node.kind === "action") {
    return {
      title: getActionLabel(node.actionId, actionCatalog),
      subtitle: node.integrationKey,
    };
  }

  if (node.kind === "wait") {
    return {
      title: "Wait",
      subtitle: node.wait.duration,
    };
  }

  return {
    title: "Terminal",
    subtitle: node.terminalType === "cancel" ? "Cancel" : "Complete",
  };
}

function resolveNodePosition(
  node: WorkflowBuilderNode,
  index: number,
): { x: number; y: number } {
  const position = node.position;
  if (
    position &&
    typeof position.x === "number" &&
    Number.isFinite(position.x) &&
    typeof position.y === "number" &&
    Number.isFinite(position.y)
  ) {
    return { x: position.x, y: position.y };
  }

  return {
    x: 80 + (index % 3) * 260,
    y: 80 + Math.floor(index / 3) * 160,
  };
}

function toFlowNode(
  node: WorkflowBuilderNode,
  index: number,
  actionCatalog: readonly WorkflowActionCatalogItem[],
): BuilderNode {
  const titles = getNodeTitle(node, actionCatalog);
  return {
    id: node.id,
    type: "workflowNode",
    position: resolveNodePosition(node, index),
    data: {
      graphNode: node,
      title: titles.title,
      subtitle: titles.subtitle,
    },
  };
}

function toFlowEdge(edge: WorkflowGraphEdge): BuilderEdge {
  const data = edge.branch ? { branch: edge.branch } : undefined;

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(data ? { data } : {}),
  };
}

function toGraphNode(node: BuilderNode): WorkflowBuilderNode | null {
  const graphNode = node.data?.graphNode;
  if (!graphNode) return null;

  return {
    ...graphNode,
    id: node.id,
    position: {
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
    },
  };
}

function toGraphEdge(edge: BuilderEdge): WorkflowGraphEdge {
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

function buildDocumentFromFlow(input: {
  currentDocument: WorkflowGraphDocument;
  flowNodes: BuilderNode[];
  flowEdges: BuilderEdge[];
}): WorkflowGraphDocument {
  const nextNodes = input.flowNodes
    .map((node) => toGraphNode(node))
    .filter((node): node is WorkflowBuilderNode => node !== null);

  const nextEdges = input.flowEdges.map((edge) => toGraphEdge(edge));

  return {
    ...input.currentDocument,
    nodes: nextNodes,
    edges: nextEdges,
  };
}

function updateNodeGraphData(
  nodes: BuilderNode[],
  nodeId: string,
  updater: (node: WorkflowBuilderNode) => WorkflowBuilderNode,
  actionCatalog: readonly WorkflowActionCatalogItem[],
): BuilderNode[] {
  return nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }

    const currentGraphNode = node.data.graphNode;
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

function WorkflowCanvasNode({ data, selected }: NodeProps) {
  const nodeData = isBuilderNodeData(data) ? data : null;
  const kindLabel = nodeData?.graphNode.kind ?? "node";

  return (
    <div
      className="min-w-[220px] rounded-xl border bg-card px-4 py-3 shadow-sm transition"
      style={{
        borderColor: selected ? "hsl(var(--primary))" : "hsl(var(--border))",
        boxShadow: selected
          ? "0 0 0 1px hsl(var(--primary) / 0.5), 0 10px 20px hsl(var(--foreground) / 0.08)"
          : "0 2px 8px hsl(var(--foreground) / 0.08)",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-3 !border-2 !border-background !bg-foreground/70"
      />
      <div className="mb-1 inline-flex rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {kindLabel}
      </div>
      <p className="text-base font-semibold">{nodeData?.title ?? "Node"}</p>
      <p className="text-sm text-muted-foreground">
        {nodeData?.subtitle ?? ""}
      </p>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-3 !border-2 !border-background !bg-foreground/70"
      />
    </div>
  );
}

const NODE_TYPES: NodeTypes = {
  workflowNode: WorkflowCanvasNode,
};

function parseInputJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function documentSignature(document: WorkflowGraphDocument): string {
  try {
    return JSON.stringify(document);
  } catch {
    return "";
  }
}

export function WorkflowBuilder({
  document,
  actionCatalog,
  onChange,
  readOnly = false,
}: WorkflowBuilderProps) {
  const lastEmittedSignatureRef = useRef<string | null>(null);
  const normalizedDocument = useMemo(() => {
    const parsed = workflowGraphDocumentSchema.safeParse(document);
    if (parsed.success) {
      return parsed.data;
    }

    return workflowGraphDocumentSchema.parse({
      schemaVersion: 1,
      nodes: [],
      edges: [],
    });
  }, [document]);

  const [nodes, setNodes] = useState<BuilderNode[]>([]);
  const [edges, setEdges] = useState<BuilderEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inputJsonDraft, setInputJsonDraft] = useState<string>("");
  const [inputJsonError, setInputJsonError] = useState<string | null>(null);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance<BuilderNode> | null>(null);
  const normalizedDocumentSignature = useMemo(
    () => documentSignature(normalizedDocument),
    [normalizedDocument],
  );

  useEffect(() => {
    if (lastEmittedSignatureRef.current === normalizedDocumentSignature) {
      return;
    }

    const flowNodes = normalizedDocument.nodes.map((node, index) =>
      toFlowNode(node, index, actionCatalog),
    );
    const flowEdges = normalizedDocument.edges.map((edge) => toFlowEdge(edge));
    setNodes(flowNodes);
    setEdges(flowEdges);
    setSelectedNodeId((currentSelectedId) => {
      if (!currentSelectedId) return null;
      return flowNodes.some((node) => node.id === currentSelectedId)
        ? currentSelectedId
        : null;
    });
  }, [
    actionCatalog,
    normalizedDocument.nodes,
    normalizedDocument.edges,
    normalizedDocumentSignature,
  ]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  useEffect(() => {
    if (!selectedNode) {
      setInputJsonDraft("");
      setInputJsonError(null);
      return;
    }

    if (selectedNode.data.graphNode.kind !== "action") {
      setInputJsonDraft("");
      setInputJsonError(null);
      return;
    }

    setInputJsonDraft(
      JSON.stringify(selectedNode.data.graphNode.input ?? {}, null, 2),
    );
    setInputJsonError(null);
  }, [selectedNode]);

  const emitChange = useCallback(
    (nextNodes: BuilderNode[], nextEdges: BuilderEdge[]) => {
      const nextDocument = buildDocumentFromFlow({
        currentDocument: normalizedDocument,
        flowNodes: nextNodes,
        flowEdges: nextEdges,
      });
      lastEmittedSignatureRef.current = documentSignature(nextDocument);
      onChange(nextDocument);
    },
    [normalizedDocument, onChange],
  );

  const focusNodeInViewport = useCallback(
    (nodeId: string) => {
      if (!reactFlowInstance) return;
      requestAnimationFrame(() => {
        void reactFlowInstance.fitView({
          nodes: [{ id: nodeId }],
          padding: 0.4,
          duration: 180,
          includeHiddenNodes: true,
        });
      });
    },
    [reactFlowInstance],
  );

  const getSpawnPosition = useCallback(
    (index: number): { x: number; y: number } => {
      if (!reactFlowInstance) {
        return {
          x: 80 + (index % 3) * 260,
          y: 80 + Math.floor(index / 3) * 160,
        };
      }

      const pane = globalThis.document?.querySelector(".react-flow__pane");
      if (!pane) {
        return {
          x: 80 + (index % 3) * 260,
          y: 80 + Math.floor(index / 3) * 160,
        };
      }

      const paneRect = pane.getBoundingClientRect();
      const center = reactFlowInstance.screenToFlowPosition({
        x: paneRect.left + paneRect.width * 0.5,
        y: paneRect.top + paneRect.height * 0.42,
      });

      return {
        x: center.x - 130 + (index % 2) * 36,
        y: center.y - 58 + Math.floor(index / 2) * 28,
      };
    },
    [reactFlowInstance],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<BuilderNode>[]) => {
      setNodes((currentNodes) => {
        const nextNodes = applyNodeChanges(changes, currentNodes);
        emitChange(nextNodes, edges);
        return nextNodes;
      });
    },
    [edges, emitChange],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<BuilderEdge>[]) => {
      setEdges((currentEdges) => {
        const nextEdges = applyEdgeChanges(changes, currentEdges);
        emitChange(nodes, nextEdges);
        return nextEdges;
      });
    },
    [emitChange, nodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) => {
        const nextEdges = addEdge(
          {
            ...connection,
            id: createNodeId("edge"),
          },
          currentEdges,
        );
        emitChange(nodes, nextEdges);
        return nextEdges;
      });
    },
    [emitChange, nodes],
  );

  const addActionNode = useCallback(() => {
    const action = actionCatalog[0];
    if (!action) return;

    const nextGraphNode: WorkflowBuilderNode = {
      id: createNodeId("action"),
      kind: "action",
      actionId: action.id,
      integrationKey: action.integrationKey,
      input: {},
      position: getSpawnPosition(nodes.length),
    };
    const nextNode = toFlowNode(nextGraphNode, nodes.length, actionCatalog);
    setNodes((currentNodes) => {
      const nextNodes = [...currentNodes, nextNode];
      emitChange(nextNodes, edges);
      return nextNodes;
    });
    setSelectedNodeId(nextGraphNode.id);
    focusNodeInViewport(nextGraphNode.id);
  }, [
    actionCatalog,
    edges,
    emitChange,
    focusNodeInViewport,
    getSpawnPosition,
    nodes.length,
  ]);

  const addWaitNode = useCallback(() => {
    const nextGraphNode: WorkflowBuilderNode = {
      id: createNodeId("wait"),
      kind: "wait",
      wait: {
        mode: "relative",
        duration: "PT30M",
        offsetDirection: "after",
      },
      position: getSpawnPosition(nodes.length),
    };
    const nextNode = toFlowNode(nextGraphNode, nodes.length, actionCatalog);
    setNodes((currentNodes) => {
      const nextNodes = [...currentNodes, nextNode];
      emitChange(nextNodes, edges);
      return nextNodes;
    });
    setSelectedNodeId(nextGraphNode.id);
    focusNodeInViewport(nextGraphNode.id);
  }, [
    actionCatalog,
    edges,
    emitChange,
    focusNodeInViewport,
    getSpawnPosition,
    nodes.length,
  ]);

  const addTerminalNode = useCallback(() => {
    const nextGraphNode: WorkflowBuilderNode = {
      id: createNodeId("terminal"),
      kind: "terminal",
      terminalType: "complete",
      position: getSpawnPosition(nodes.length),
    };
    const nextNode = toFlowNode(nextGraphNode, nodes.length, actionCatalog);
    setNodes((currentNodes) => {
      const nextNodes = [...currentNodes, nextNode];
      emitChange(nextNodes, edges);
      return nextNodes;
    });
    setSelectedNodeId(nextGraphNode.id);
    focusNodeInViewport(nextGraphNode.id);
  }, [
    actionCatalog,
    edges,
    emitChange,
    focusNodeInViewport,
    getSpawnPosition,
    nodes.length,
  ]);

  const updateSelectedNode = useCallback(
    (updater: (node: WorkflowBuilderNode) => WorkflowBuilderNode) => {
      if (!selectedNodeId) {
        return;
      }

      setNodes((currentNodes) => {
        const nextNodes = updateNodeGraphData(
          currentNodes,
          selectedNodeId,
          updater,
          actionCatalog,
        );
        emitChange(nextNodes, edges);
        return nextNodes;
      });
    },
    [actionCatalog, edges, emitChange, selectedNodeId],
  );

  const selectedGraphNode = selectedNode?.data.graphNode ?? null;
  const editableFlowHandlers = readOnly
    ? {}
    : {
        onNodesChange,
        onEdgesChange,
        onConnect,
      };

  return (
    <div className="grid h-full min-h-[560px] grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_280px]">
      <div className="relative overflow-hidden rounded-lg border border-border">
        <ReactFlow<BuilderNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onInit={setReactFlowInstance}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: false,
            style: {
              stroke: "hsl(var(--muted-foreground) / 0.45)",
              strokeWidth: 2,
            },
          }}
          connectionLineStyle={{
            stroke: "hsl(var(--primary))",
            strokeWidth: 2,
          }}
          {...editableFlowHandlers}
          onSelectionChange={(selection) => {
            const selected = selection.nodes[0];
            setSelectedNodeId(selected?.id ?? null);
          }}
          fitView
        >
          <Background
            gap={18}
            size={1}
            color="hsl(var(--muted-foreground) / 0.22)"
          />
          <MiniMap />
          <Controls />
        </ReactFlow>

        {!readOnly ? (
          <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium shadow-sm"
              onClick={addActionNode}
              disabled={actionCatalog.length === 0}
            >
              Add Action
            </button>
            <button
              type="button"
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium shadow-sm"
              onClick={addWaitNode}
            >
              Add Wait
            </button>
            <button
              type="button"
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium shadow-sm"
              onClick={addTerminalNode}
            >
              Add Terminal
            </button>
          </div>
        ) : null}

        {!readOnly && nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center px-4">
            <div className="pointer-events-auto w-full max-w-md rounded-xl border border-border bg-background/95 p-4 text-center shadow-sm backdrop-blur-sm">
              <p className="text-sm font-semibold">Start your workflow</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a first node to begin building the flow.
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium shadow-sm"
                  onClick={addActionNode}
                  disabled={actionCatalog.length === 0}
                >
                  Add Action
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium shadow-sm"
                  onClick={addWaitNode}
                >
                  Add Wait
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium shadow-sm"
                  onClick={addTerminalNode}
                >
                  Add Terminal
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-lg border border-border p-3">
        <p className="text-sm font-medium">Inspector</p>
        {!selectedGraphNode ? (
          <p className="text-sm text-muted-foreground">
            Select a node to edit its configuration.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Node ID</p>
              <p className="font-mono text-xs">{selectedGraphNode.id}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Kind</p>
              <p className="text-sm">{selectedGraphNode.kind}</p>
            </div>

            {selectedGraphNode.kind === "action" ? (
              <div className="space-y-2">
                <label className="block text-xs text-muted-foreground">
                  Action
                </label>
                <select
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                  value={selectedGraphNode.actionId}
                  disabled={readOnly}
                  onChange={(event) => {
                    const action = actionCatalog.find(
                      (item) => item.id === event.target.value,
                    );
                    if (!action) return;
                    updateSelectedNode((node) => {
                      if (node.kind !== "action") {
                        return node;
                      }

                      return {
                        ...node,
                        actionId: action.id,
                        integrationKey: action.integrationKey,
                      };
                    });
                  }}
                >
                  {actionCatalog.map((action) => (
                    <option key={action.id} value={action.id}>
                      {action.label}
                    </option>
                  ))}
                </select>

                <label className="block text-xs text-muted-foreground">
                  Input (JSON)
                </label>
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
                  value={inputJsonDraft}
                  disabled={readOnly}
                  onChange={(event) => {
                    setInputJsonDraft(event.target.value);
                    setInputJsonError(null);
                  }}
                  onBlur={() => {
                    const parsed = parseInputJson(inputJsonDraft);
                    if (!parsed) {
                      setInputJsonError("Input must be a JSON object.");
                      return;
                    }

                    updateSelectedNode((node) => {
                      if (node.kind !== "action") {
                        return node;
                      }

                      return {
                        ...node,
                        input: parsed,
                      };
                    });
                    setInputJsonError(null);
                  }}
                />
                {inputJsonError ? (
                  <p className="text-xs text-destructive">{inputJsonError}</p>
                ) : null}

                <div className="space-y-2 rounded-md border border-border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">Guard</p>
                    {selectedGraphNode.guard ? (
                      <button
                        type="button"
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                        disabled={readOnly}
                        onClick={() =>
                          updateSelectedNode((node) => {
                            if (node.kind !== "action") {
                              return node;
                            }

                            return {
                              ...node,
                              guard: undefined,
                            };
                          })
                        }
                      >
                        Disable Guard
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                        disabled={readOnly}
                        onClick={() =>
                          updateSelectedNode((node) => {
                            if (node.kind !== "action") {
                              return node;
                            }

                            return {
                              ...node,
                              guard: {
                                combinator: "all",
                                conditions: [createDefaultGuardCondition()],
                              },
                            };
                          })
                        }
                      >
                        Enable Guard
                      </button>
                    )}
                  </div>

                  {selectedGraphNode.guard ? (
                    <div className="space-y-2">
                      <label className="block text-xs text-muted-foreground">
                        Match
                      </label>
                      <select
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                        value={selectedGraphNode.guard.combinator}
                        disabled={readOnly}
                        onChange={(event) =>
                          updateSelectedNode((node) => {
                            if (node.kind !== "action" || !node.guard) {
                              return node;
                            }

                            return {
                              ...node,
                              guard: {
                                ...node.guard,
                                combinator:
                                  event.target.value === "any" ? "any" : "all",
                              },
                            };
                          })
                        }
                      >
                        <option value="all">all conditions</option>
                        <option value="any">any condition</option>
                      </select>

                      {selectedGraphNode.guard.conditions.map(
                        (condition, index) => (
                          <div
                            key={`${selectedGraphNode.id}-guard-${index}`}
                            className="space-y-2 rounded-md border border-border p-2"
                          >
                            <label className="block text-xs text-muted-foreground">
                              Field Path
                            </label>
                            <input
                              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                              value={condition.field}
                              disabled={readOnly}
                              placeholder="appointment.startAt"
                              onChange={(event) =>
                                updateSelectedNode((node) => {
                                  if (node.kind !== "action" || !node.guard) {
                                    return node;
                                  }

                                  const nextConditions =
                                    node.guard.conditions.map(
                                      (entry, conditionIndex) =>
                                        conditionIndex === index
                                          ? {
                                              ...entry,
                                              field:
                                                event.target.value.length > 0
                                                  ? event.target.value
                                                  : "id",
                                            }
                                          : entry,
                                    );

                                  return {
                                    ...node,
                                    guard: {
                                      ...node.guard,
                                      conditions: nextConditions,
                                    },
                                  };
                                })
                              }
                            />

                            <label className="block text-xs text-muted-foreground">
                              Operator
                            </label>
                            <select
                              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                              value={condition.operator}
                              disabled={readOnly}
                              onChange={(event) => {
                                if (!isGuardOperator(event.target.value)) {
                                  return;
                                }
                                const nextOperator = event.target.value;

                                updateSelectedNode((node) => {
                                  if (node.kind !== "action" || !node.guard) {
                                    return node;
                                  }

                                  const nextConditions =
                                    node.guard.conditions.map(
                                      (entry, conditionIndex) => {
                                        if (conditionIndex !== index) {
                                          return entry;
                                        }

                                        const baseCondition = {
                                          field: entry.field,
                                          operator: nextOperator,
                                        } as const;

                                        if (!operatorNeedsValue(nextOperator)) {
                                          return baseCondition;
                                        }

                                        const normalizedValue =
                                          nextOperator === "in" ||
                                          nextOperator === "not_in"
                                            ? Array.isArray(entry.value)
                                              ? entry.value
                                              : []
                                            : Array.isArray(entry.value)
                                              ? ""
                                              : (entry.value ?? "");

                                        return {
                                          ...baseCondition,
                                          value: normalizedValue,
                                        };
                                      },
                                    );

                                  return {
                                    ...node,
                                    guard: {
                                      ...node.guard,
                                      conditions: nextConditions,
                                    },
                                  };
                                });
                              }}
                            >
                              {GUARD_OPERATORS.map((operator) => (
                                <option key={operator} value={operator}>
                                  {operator}
                                </option>
                              ))}
                            </select>

                            {operatorNeedsValue(condition.operator) ? (
                              <>
                                <label className="block text-xs text-muted-foreground">
                                  Value
                                </label>
                                <input
                                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                                  value={formatGuardValueInput(
                                    condition.value,
                                    condition.operator,
                                  )}
                                  disabled={readOnly}
                                  placeholder={
                                    condition.operator === "in" ||
                                    condition.operator === "not_in"
                                      ? "valueA, valueB"
                                      : "example value"
                                  }
                                  onChange={(event) =>
                                    updateSelectedNode((node) => {
                                      if (
                                        node.kind !== "action" ||
                                        !node.guard
                                      ) {
                                        return node;
                                      }

                                      const nextConditions =
                                        node.guard.conditions.map(
                                          (entry, conditionIndex) =>
                                            conditionIndex === index
                                              ? {
                                                  ...entry,
                                                  value: parseGuardValueInput(
                                                    event.target.value,
                                                    entry.operator,
                                                  ),
                                                }
                                              : entry,
                                        );

                                      return {
                                        ...node,
                                        guard: {
                                          ...node.guard,
                                          conditions: nextConditions,
                                        },
                                      };
                                    })
                                  }
                                />
                              </>
                            ) : null}

                            <div className="flex justify-end">
                              <button
                                type="button"
                                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                                disabled={
                                  readOnly ||
                                  (selectedGraphNode.guard?.conditions.length ??
                                    0) <= 1
                                }
                                onClick={() =>
                                  updateSelectedNode((node) => {
                                    if (node.kind !== "action" || !node.guard) {
                                      return node;
                                    }

                                    const nextConditions =
                                      node.guard.conditions.filter(
                                        (_entry, conditionIndex) =>
                                          conditionIndex !== index,
                                      );

                                    return {
                                      ...node,
                                      guard: {
                                        ...node.guard,
                                        conditions:
                                          nextConditions.length > 0
                                            ? nextConditions
                                            : [createDefaultGuardCondition()],
                                      },
                                    };
                                  })
                                }
                              >
                                Remove Condition
                              </button>
                            </div>
                          </div>
                        ),
                      )}

                      <button
                        type="button"
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                        disabled={readOnly}
                        onClick={() =>
                          updateSelectedNode((node) => {
                            if (node.kind !== "action" || !node.guard) {
                              return node;
                            }

                            return {
                              ...node,
                              guard: {
                                ...node.guard,
                                conditions: [
                                  ...node.guard.conditions,
                                  createDefaultGuardCondition(),
                                ],
                              },
                            };
                          })
                        }
                      >
                        Add Condition
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No guard configured. Add a guard to conditionally run this
                      action.
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            {selectedGraphNode.kind === "wait" ? (
              <div className="space-y-2">
                <label className="block text-xs text-muted-foreground">
                  Duration (ISO 8601)
                </label>
                <input
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                  value={selectedGraphNode.wait.duration}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateSelectedNode((node) => {
                      if (node.kind !== "wait") {
                        return node;
                      }

                      return {
                        ...node,
                        wait: {
                          ...node.wait,
                          duration: event.target.value,
                        },
                      };
                    })
                  }
                />
                <label className="block text-xs text-muted-foreground">
                  Reference Field (optional)
                </label>
                <input
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                  value={selectedGraphNode.wait.referenceField ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateSelectedNode((node) => {
                      if (node.kind !== "wait") {
                        return node;
                      }

                      return {
                        ...node,
                        wait: {
                          ...node.wait,
                          referenceField:
                            event.target.value.trim().length > 0
                              ? event.target.value
                              : undefined,
                        },
                      };
                    })
                  }
                />
                <label className="block text-xs text-muted-foreground">
                  Offset Direction
                </label>
                <select
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                  value={selectedGraphNode.wait.offsetDirection}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateSelectedNode((node) => {
                      if (node.kind !== "wait") {
                        return node;
                      }

                      return {
                        ...node,
                        wait: {
                          ...node.wait,
                          offsetDirection:
                            event.target.value === "before"
                              ? "before"
                              : "after",
                        },
                      };
                    })
                  }
                >
                  <option value="after">after</option>
                  <option value="before">before</option>
                </select>
              </div>
            ) : null}

            {selectedGraphNode.kind === "terminal" ? (
              <div className="space-y-2">
                <label className="block text-xs text-muted-foreground">
                  Terminal Type
                </label>
                <select
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                  value={selectedGraphNode.terminalType}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateSelectedNode((node) => {
                      if (node.kind !== "terminal") {
                        return node;
                      }

                      return {
                        ...node,
                        terminalType:
                          event.target.value === "cancel"
                            ? "cancel"
                            : "complete",
                      };
                    })
                  }
                >
                  <option value="complete">complete</option>
                  <option value="cancel">cancel</option>
                </select>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
