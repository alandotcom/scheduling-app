// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import parseDuration from "parse-duration";
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
  WebhookEventType,
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
  triggerEventType: WebhookEventType;
  availableTriggerEventTypes: readonly WebhookEventType[];
  onTriggerEventTypeChange: (eventType: WebhookEventType) => void;
  onChange: (next: WorkflowGraphDocument) => void;
  readOnly?: boolean;
};

type WorkflowBuilderNode = WorkflowGraphNode & {
  position?: {
    x?: number;
    y?: number;
  };
};

type TriggerCanvasNode = {
  id: typeof TRIGGER_NODE_ID;
  kind: "trigger";
  eventType: WebhookEventType;
};

type CanvasGraphNode = WorkflowBuilderNode | TriggerCanvasNode;

type BuilderNodeData = {
  graphNode: CanvasGraphNode;
  title: string;
  subtitle: string;
};

type BuilderNode = Node<BuilderNodeData>;
type BuilderEdge = Edge;

const TRIGGER_NODE_ID = "__trigger__";
const TRIGGER_EDGE_PREFIX = "__trigger_edge__";

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
  node: CanvasGraphNode,
  actionCatalog: readonly WorkflowActionCatalogItem[],
): { title: string; subtitle: string } {
  if (node.kind === "trigger") {
    return {
      title: "Trigger",
      subtitle: node.eventType,
    };
  }

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

function isWorkflowGraphNode(
  node: CanvasGraphNode,
): node is WorkflowBuilderNode {
  return node.kind !== "trigger";
}

function normalizeIsoDurationForParse(value: string): string {
  if (!value.startsWith("P")) {
    return value;
  }

  const separatorIndex = value.indexOf("T");
  if (separatorIndex <= 1 || separatorIndex >= value.length - 1) {
    return value;
  }

  // parse-duration handles ISO date and time chunks, but combined strings
  // like `P3DT2H` must be expressed as `P3D PT2H`.
  const dateChunk = value.slice(0, separatorIndex);
  const timeChunk = value.slice(separatorIndex + 1);
  return `${dateChunk} PT${timeChunk}`;
}

function parseWorkflowDurationToMs(value: string): number | null {
  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    return null;
  }

  const parsed = parseDuration(
    normalizeIsoDurationForParse(normalizedValue.toUpperCase()),
  );
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

function formatDurationMsAsIso8601(durationMs: number): string {
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

function humanizeDuration(durationMs: number): string {
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

  if (parts.length === 0) {
    return `${Math.floor(durationMs)} ms`;
  }

  return parts.join(" ");
}

function createTriggerFlowNode(eventType: WebhookEventType): BuilderNode {
  const triggerNode: TriggerCanvasNode = {
    id: TRIGGER_NODE_ID,
    kind: "trigger",
    eventType,
  };
  const titles = getNodeTitle(triggerNode, []);

  return {
    id: TRIGGER_NODE_ID,
    type: "workflowNode",
    draggable: false,
    deletable: false,
    connectable: false,
    position: {
      x: -260,
      y: 120,
    },
    data: {
      graphNode: triggerNode,
      title: titles.title,
      subtitle: titles.subtitle,
    },
  };
}

function getPathValue(payload: Record<string, unknown>, path: string): unknown {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  let current: unknown = payload;
  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

function toTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) {
      return Math.floor(value);
    }

    if (value > 1_000_000_000) {
      return Math.floor(value * 1_000);
    }
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function formatAbsoluteDateTime(valueMs: number): string {
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
    if (!isWorkflowGraphNode(currentGraphNode)) {
      return node;
    }
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
  const isTrigger = nodeData?.graphNode.kind === "trigger";
  const isTerminal = nodeData?.graphNode.kind === "terminal";

  return (
    <div
      className="min-w-[220px] rounded-xl border bg-card px-4 py-3 shadow-sm transition"
      style={{
        borderColor:
          selected || isTrigger ? "hsl(var(--primary))" : "hsl(var(--border))",
        boxShadow: selected
          ? "0 0 0 1px hsl(var(--primary) / 0.5), 0 10px 20px hsl(var(--foreground) / 0.08)"
          : "0 2px 8px hsl(var(--foreground) / 0.08)",
      }}
    >
      {!isTrigger ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!size-3 !border-2 !border-background !bg-foreground/70"
        />
      ) : null}
      <div className="mb-1 inline-flex rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {kindLabel}
      </div>
      <p className="text-base font-semibold">{nodeData?.title ?? "Node"}</p>
      <p className="text-sm text-muted-foreground">
        {nodeData?.subtitle ?? ""}
      </p>
      {!isTerminal ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!size-3 !border-2 !border-background !bg-foreground/70"
          isConnectable={!isTrigger}
        />
      ) : null}
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
  triggerEventType,
  availableTriggerEventTypes,
  onTriggerEventTypeChange,
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
  const [waitDurationDraft, setWaitDurationDraft] = useState<string>("");
  const [waitDurationError, setWaitDurationError] = useState<string | null>(
    null,
  );
  const [samplePayloadDraft, setSamplePayloadDraft] = useState<string>("{}");
  const [samplePayloadError, setSamplePayloadError] = useState<string | null>(
    null,
  );
  const [samplePayload, setSamplePayload] = useState<Record<
    string,
    unknown
  > | null>(null);
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

    const flowNodes = [
      createTriggerFlowNode(triggerEventType),
      ...normalizedDocument.nodes.map((node, index) =>
        toFlowNode(node, index, actionCatalog),
      ),
    ];
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
    triggerEventType,
    normalizedDocument.nodes,
    normalizedDocument.edges,
    normalizedDocumentSignature,
  ]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedGraphNode = selectedNode?.data.graphNode ?? null;

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

  useEffect(() => {
    if (!selectedNode || selectedNode.data.graphNode.kind !== "wait") {
      setWaitDurationDraft("");
      setWaitDurationError(null);
      return;
    }

    setWaitDurationDraft(selectedNode.data.graphNode.wait.duration);
    setWaitDurationError(null);
  }, [selectedNodeId]);

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
      if (
        !connection.source ||
        !connection.target ||
        connection.source === TRIGGER_NODE_ID ||
        connection.target === TRIGGER_NODE_ID
      ) {
        return;
      }

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

    const graphNodeCount = nodes.filter(
      (node) => node.data.graphNode.kind !== "trigger",
    ).length;

    const nextGraphNode: WorkflowBuilderNode = {
      id: createNodeId("action"),
      kind: "action",
      actionId: action.id,
      integrationKey: action.integrationKey,
      input: {},
      position: getSpawnPosition(graphNodeCount),
    };
    const nextNode = toFlowNode(nextGraphNode, graphNodeCount, actionCatalog);
    const sourceNodeId =
      selectedGraphNode &&
      selectedGraphNode.kind !== "trigger" &&
      selectedGraphNode.kind !== "terminal"
        ? selectedGraphNode.id
        : null;
    const nextNodes = [...nodes, nextNode];
    const nextEdges =
      sourceNodeId && !edges.some((edge) => edge.source === sourceNodeId)
        ? [
            ...edges,
            {
              id: createNodeId("edge"),
              source: sourceNodeId,
              target: nextGraphNode.id,
            } satisfies BuilderEdge,
          ]
        : edges;
    setNodes(nextNodes);
    setEdges(nextEdges);
    emitChange(nextNodes, nextEdges);
    setSelectedNodeId(nextGraphNode.id);
    focusNodeInViewport(nextGraphNode.id);
  }, [
    actionCatalog,
    edges,
    emitChange,
    focusNodeInViewport,
    getSpawnPosition,
    nodes,
    selectedGraphNode,
  ]);

  const addWaitNode = useCallback(() => {
    const graphNodeCount = nodes.filter(
      (node) => node.data.graphNode.kind !== "trigger",
    ).length;
    const nextGraphNode: WorkflowBuilderNode = {
      id: createNodeId("wait"),
      kind: "wait",
      wait: {
        mode: "relative",
        duration: "PT30M",
        offsetDirection: "after",
      },
      position: getSpawnPosition(graphNodeCount),
    };
    const nextNode = toFlowNode(nextGraphNode, graphNodeCount, actionCatalog);
    const sourceNodeId =
      selectedGraphNode &&
      selectedGraphNode.kind !== "trigger" &&
      selectedGraphNode.kind !== "terminal"
        ? selectedGraphNode.id
        : null;
    const nextNodes = [...nodes, nextNode];
    const nextEdges =
      sourceNodeId && !edges.some((edge) => edge.source === sourceNodeId)
        ? [
            ...edges,
            {
              id: createNodeId("edge"),
              source: sourceNodeId,
              target: nextGraphNode.id,
            } satisfies BuilderEdge,
          ]
        : edges;
    setNodes(nextNodes);
    setEdges(nextEdges);
    emitChange(nextNodes, nextEdges);
    setSelectedNodeId(nextGraphNode.id);
    focusNodeInViewport(nextGraphNode.id);
  }, [
    actionCatalog,
    edges,
    emitChange,
    focusNodeInViewport,
    getSpawnPosition,
    nodes,
    selectedGraphNode,
  ]);

  const addTerminalNode = useCallback(() => {
    const graphNodeCount = nodes.filter(
      (node) => node.data.graphNode.kind !== "trigger",
    ).length;
    const nextGraphNode: WorkflowBuilderNode = {
      id: createNodeId("terminal"),
      kind: "terminal",
      terminalType: "complete",
      position: getSpawnPosition(graphNodeCount),
    };
    const nextNode = toFlowNode(nextGraphNode, graphNodeCount, actionCatalog);
    const sourceNodeId =
      selectedGraphNode &&
      selectedGraphNode.kind !== "trigger" &&
      selectedGraphNode.kind !== "terminal"
        ? selectedGraphNode.id
        : null;
    const nextNodes = [...nodes, nextNode];
    const nextEdges =
      sourceNodeId && !edges.some((edge) => edge.source === sourceNodeId)
        ? [
            ...edges,
            {
              id: createNodeId("edge"),
              source: sourceNodeId,
              target: nextGraphNode.id,
            } satisfies BuilderEdge,
          ]
        : edges;
    setNodes(nextNodes);
    setEdges(nextEdges);
    emitChange(nextNodes, nextEdges);
    setSelectedNodeId(nextGraphNode.id);
    focusNodeInViewport(nextGraphNode.id);
  }, [
    actionCatalog,
    edges,
    emitChange,
    focusNodeInViewport,
    getSpawnPosition,
    nodes,
    selectedGraphNode,
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

  const triggerEdges = useMemo(() => {
    const incomingTargets = new Set(edges.map((edge) => edge.target));
    const rootNodes = nodes.filter(
      (node) =>
        node.data.graphNode.kind !== "trigger" && !incomingTargets.has(node.id),
    );

    return rootNodes.map((node) => ({
      id: `${TRIGGER_EDGE_PREFIX}${node.id}`,
      source: TRIGGER_NODE_ID,
      target: node.id,
      type: "smoothstep",
      selectable: false,
      focusable: false,
      deletable: false,
      reconnectable: false,
      style: {
        stroke: "hsl(var(--muted-foreground) / 0.35)",
        strokeDasharray: "4 4",
        strokeWidth: 2,
      },
    }));
  }, [edges, nodes]);

  const renderedEdges = useMemo(
    () => [...edges, ...triggerEdges],
    [edges, triggerEdges],
  );
  const graphNodeCount = useMemo(
    () => nodes.filter((node) => node.data.graphNode.kind !== "trigger").length,
    [nodes],
  );

  const parsedWaitDurationMs = useMemo(
    () => parseWorkflowDurationToMs(waitDurationDraft),
    [waitDurationDraft],
  );

  const waitDurationSummary = useMemo(() => {
    if (parsedWaitDurationMs === null) {
      return null;
    }

    return {
      durationMs: parsedWaitDurationMs,
      humanLabel: humanizeDuration(parsedWaitDurationMs),
      iso8601: formatDurationMsAsIso8601(parsedWaitDurationMs),
    };
  }, [parsedWaitDurationMs]);

  const waitReferencePreview = useMemo(() => {
    if (!selectedGraphNode || selectedGraphNode.kind !== "wait") {
      return null;
    }

    if (!selectedGraphNode.wait.referenceField || !waitDurationSummary) {
      return null;
    }

    if (!samplePayload) {
      return { error: "Add an example trigger payload to preview this wait." };
    }

    const referenceValue = getPathValue(
      samplePayload,
      selectedGraphNode.wait.referenceField,
    );
    if (referenceValue === undefined) {
      return {
        error: `Could not resolve '${selectedGraphNode.wait.referenceField}' in the sample payload.`,
      };
    }

    const referenceMs = toTimestamp(referenceValue);
    if (referenceMs === null) {
      return {
        error: `Resolved reference value is not a valid date/time: ${JSON.stringify(referenceValue)}`,
      };
    }

    const scheduledMs =
      selectedGraphNode.wait.offsetDirection === "before"
        ? referenceMs - waitDurationSummary.durationMs
        : referenceMs + waitDurationSummary.durationMs;

    return {
      referenceDate: formatAbsoluteDateTime(referenceMs),
      scheduledDate: formatAbsoluteDateTime(scheduledMs),
    };
  }, [samplePayload, selectedGraphNode, waitDurationSummary]);
  const isAvailableTriggerEventType = useCallback(
    (value: string): value is WebhookEventType =>
      availableTriggerEventTypes.some((eventType) => eventType === value),
    [availableTriggerEventTypes],
  );

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
          edges={renderedEdges}
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

        {!readOnly && graphNodeCount === 0 ? (
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

            {selectedGraphNode.kind === "trigger" ? (
              <div className="space-y-2">
                <label className="block text-xs text-muted-foreground">
                  Trigger Event
                </label>
                <select
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                  value={selectedGraphNode.eventType}
                  disabled={readOnly}
                  onChange={(event) => {
                    const nextEventType = event.target.value;
                    if (!isAvailableTriggerEventType(nextEventType)) {
                      return;
                    }
                    onTriggerEventTypeChange(nextEventType);
                  }}
                >
                  {availableTriggerEventTypes.map((eventType) => (
                    <option key={eventType} value={eventType}>
                      {eventType}
                    </option>
                  ))}
                </select>

                <label className="block text-xs text-muted-foreground">
                  Example Payload (JSON, optional)
                </label>
                <textarea
                  className="min-h-[140px] w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
                  value={samplePayloadDraft}
                  disabled={readOnly}
                  onChange={(event) => {
                    setSamplePayloadDraft(event.target.value);
                    setSamplePayloadError(null);
                  }}
                  onBlur={() => {
                    const trimmed = samplePayloadDraft.trim();
                    if (trimmed.length === 0) {
                      setSamplePayload(null);
                      setSamplePayloadError(null);
                      return;
                    }

                    const parsed = parseInputJson(trimmed);
                    if (!parsed) {
                      setSamplePayloadError(
                        "Example payload must be a JSON object.",
                      );
                      return;
                    }

                    setSamplePayload(parsed);
                    setSamplePayloadError(null);
                  }}
                />
                {samplePayloadError ? (
                  <p className="text-xs text-destructive">
                    {samplePayloadError}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Used for wait-date previews when a reference field is set.
                  </p>
                )}
              </div>
            ) : null}

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
                  Duration
                </label>
                <input
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                  value={waitDurationDraft}
                  disabled={readOnly}
                  placeholder="30d, 12h, PT30M"
                  onChange={(event) => {
                    setWaitDurationDraft(event.target.value);
                    setWaitDurationError(null);
                  }}
                  onBlur={() => {
                    const durationMs =
                      parseWorkflowDurationToMs(waitDurationDraft);
                    if (durationMs === null) {
                      setWaitDurationError(
                        "Enter a valid duration like 30d or PT30M.",
                      );
                      return;
                    }

                    const canonicalIso = formatDurationMsAsIso8601(durationMs);
                    updateSelectedNode((node) => {
                      if (node.kind !== "wait") {
                        return node;
                      }

                      return {
                        ...node,
                        wait: {
                          ...node.wait,
                          duration: canonicalIso,
                        },
                      };
                    });
                    setWaitDurationDraft(canonicalIso);
                    setWaitDurationError(null);
                  }}
                />
                {waitDurationError ? (
                  <p className="text-xs text-destructive">
                    {waitDurationError}
                  </p>
                ) : null}
                {waitDurationSummary ? (
                  <p className="text-xs text-muted-foreground">
                    Parsed as {waitDurationSummary.humanLabel} (
                    {waitDurationSummary.iso8601})
                  </p>
                ) : null}
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
                {waitReferencePreview && "error" in waitReferencePreview ? (
                  <p className="text-xs text-muted-foreground">
                    {waitReferencePreview.error}
                  </p>
                ) : null}
                {waitReferencePreview && !("error" in waitReferencePreview) ? (
                  <div className="rounded-md border border-border bg-muted/20 p-2 text-xs">
                    <p className="text-muted-foreground">
                      Reference date: {waitReferencePreview.referenceDate}
                    </p>
                    <p className="font-medium">
                      Scheduled send: {waitReferencePreview.scheduledDate}
                    </p>
                  </div>
                ) : null}
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
