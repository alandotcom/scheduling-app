import {
  Add01Icon,
  CheckmarkCircle02Icon,
  Delete01Icon,
  FloppyDiskIcon,
  Flowchart01Icon,
  GitBranchIcon,
  HourglassIcon,
  PlayIcon,
  Rocket01Icon,
  ZapIcon,
} from "@hugeicons/core-free-icons";
import { Popover } from "@base-ui/react/popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  applyEdgeChanges,
  applyNodeChanges,
  ConnectionMode,
  type Connection,
  type Edge,
  type EdgeChange,
  MarkerType,
  type OnConnectStartParams,
  type Node as RFNode,
  type NodeChange,
  type NodeProps,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { atom, useAtom } from "jotai";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  DomainEventType,
  WorkflowActionCatalogItem,
  WorkflowActionConfigField,
  WorkflowDomainEventTriggerConfig,
  WorkflowGraphDocument,
  WorkflowGuard,
  WorkflowGuardCondition,
  WorkflowGraphNode,
  WorkflowScheduleTriggerConfig,
  WorkflowTriggerCatalogItem,
  WorkflowTriggerConfig,
  WorkflowValidationResult,
  WorkflowWaitNodeConfig,
} from "@scheduling/dto";
import { Canvas } from "@/components/flow-elements/canvas";
import { Connection as FlowConnection } from "@/components/flow-elements/connection";
import { Controls as FlowControls } from "@/components/flow-elements/controls";
import { Edge as FlowEdge } from "@/components/flow-elements/edge";
import {
  Node as FlowNode,
  NodeDescription,
  NodeTitle,
} from "@/components/flow-elements/node";
import { Panel } from "@/components/flow-elements/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { orpc } from "@/lib/query";
import "@xyflow/react/dist/style.css";

type BranchType = "next" | "timeout" | "true" | "false";

type TriggerCanvasNodeData = {
  kind: "trigger";
};

type ActionCanvasNodeData = {
  kind: "action";
  label: string;
  actionId: string;
  integrationKey: string;
  input: Record<string, unknown>;
  guard?: WorkflowGuard;
};

type WaitCanvasNodeData = {
  kind: "wait";
  label: string;
  wait: WorkflowWaitNodeConfig;
};

type ConditionCanvasNodeData = {
  kind: "condition";
  label: string;
  guard: WorkflowGuard;
};

type EditorNodeData =
  | TriggerCanvasNodeData
  | ActionCanvasNodeData
  | WaitCanvasNodeData
  | ConditionCanvasNodeData;

type TriggerEditorNode = RFNode<TriggerCanvasNodeData, "trigger">;
type ActionEditorNode = RFNode<ActionCanvasNodeData, "action">;
type WaitEditorNode = RFNode<WaitCanvasNodeData, "wait">;
type ConditionEditorNode = RFNode<ConditionCanvasNodeData, "condition">;
type EditorNode =
  | TriggerEditorNode
  | ActionEditorNode
  | WaitEditorNode
  | ConditionEditorNode;
type EditorEdge = Edge<{ branch?: BranchType; virtualTrigger?: boolean }>;

const TRIGGER_NODE_ID = "node_trigger";
const DEFAULT_SCHEMA_VERSION = 1;

const editorNodesAtom = atom<EditorNode[]>([]);
const editorEdgesAtom = atom<EditorEdge[]>([]);
const selectedNodeIdAtom = atom<string | null>(null);
const selectedEdgeIdAtom = atom<string | null>(null);

function definitionStatusBadgeVariant(status: "draft" | "active" | "archived") {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  return "outline";
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function isAdminRole(role: "owner" | "admin" | "member" | null | undefined) {
  return role === "owner" || role === "admin";
}

function mergeUniqueSortedEvents(values: readonly string[]): DomainEventType[] {
  return [...new Set(values)].toSorted() as DomainEventType[];
}

function updateDomainTriggerEventSet(input: {
  trigger: WorkflowDomainEventTriggerConfig;
  bucket: "start" | "restart" | "stop";
  eventType: DomainEventType;
  checked: boolean;
}): WorkflowDomainEventTriggerConfig {
  const nextStart = new Set(input.trigger.startEvents);
  const nextRestart = new Set(input.trigger.restartEvents);
  const nextStop = new Set(input.trigger.stopEvents);

  const target =
    input.bucket === "start"
      ? nextStart
      : input.bucket === "restart"
        ? nextRestart
        : nextStop;

  if (input.checked) {
    target.add(input.eventType);
    if (input.bucket !== "start") nextStart.delete(input.eventType);
    if (input.bucket !== "restart") nextRestart.delete(input.eventType);
    if (input.bucket !== "stop") nextStop.delete(input.eventType);
  } else {
    target.delete(input.eventType);
  }

  return {
    ...input.trigger,
    startEvents: mergeUniqueSortedEvents([...nextStart]),
    restartEvents: mergeUniqueSortedEvents([...nextRestart]),
    stopEvents: mergeUniqueSortedEvents([...nextStop]),
  };
}

function buildDefaultDomainTrigger(
  catalogItem: Extract<WorkflowTriggerCatalogItem, { type: "domain_event" }>,
): WorkflowDomainEventTriggerConfig {
  return {
    type: "domain_event",
    domain: catalogItem.domain,
    startEvents: [...catalogItem.defaultStartEvents],
    restartEvents: [...catalogItem.defaultRestartEvents],
    stopEvents: [...catalogItem.defaultStopEvents],
  };
}

function buildDefaultScheduleTrigger(
  catalogItem: Extract<WorkflowTriggerCatalogItem, { type: "schedule" }> | null,
): WorkflowScheduleTriggerConfig {
  return {
    type: "schedule",
    expression: "*/15 * * * *",
    timezone: catalogItem?.defaultTimezone ?? "America/New_York",
    replacement: {
      mode: "allow_parallel",
      cancelOnTerminalState: false,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveActionInputDefaults(
  action: WorkflowActionCatalogItem | null,
): Record<string, unknown> {
  if (!action?.configFields || action.configFields.length === 0) {
    return {};
  }

  const entries: [string, unknown][] = [];

  for (const field of action.configFields) {
    if ("fields" in field) {
      for (const nestedField of field.fields) {
        entries.push([
          nestedField.key,
          nestedField.defaultValue ?? (nestedField.type === "number" ? 0 : ""),
        ]);
      }
      continue;
    }

    entries.push([
      field.key,
      field.defaultValue ?? (field.type === "number" ? 0 : ""),
    ]);
  }

  return Object.fromEntries(entries);
}

function getDefaultActionNodeData(
  actions: readonly WorkflowActionCatalogItem[],
): ActionCanvasNodeData {
  const firstAction = actions[0] ?? null;
  return {
    kind: "action",
    label: firstAction?.label ?? "Action",
    actionId: firstAction?.id ?? "resend.sendEmail",
    integrationKey: firstAction?.integrationKey ?? "resend",
    input: resolveActionInputDefaults(firstAction),
  };
}

function getDefaultWaitNodeData(): WaitCanvasNodeData {
  return {
    kind: "wait",
    label: "Wait",
    wait: {
      mode: "relative",
      duration: "PT1H",
      offsetDirection: "after",
    },
  };
}

function getDefaultConditionNodeData(): ConditionCanvasNodeData {
  return {
    kind: "condition",
    label: "Condition",
    guard: {
      combinator: "all",
      conditions: [{ field: "id", operator: "exists" }],
    },
  };
}

function getGridPosition(index: number) {
  return {
    x: 280 + (index % 3) * 280,
    y: 70 + Math.floor(index / 3) * 170,
  };
}

function getNextNodePosition(input: {
  nodes: readonly EditorNode[];
  selectedNodeId: string | null;
}) {
  const triggerNode = input.nodes.find((node) => node.id === TRIGGER_NODE_ID);
  const nonTriggerNodes = input.nodes.filter(
    (node) => node.id !== TRIGGER_NODE_ID,
  );

  const selectedNode =
    input.selectedNodeId === null
      ? null
      : input.nodes.find((node) => node.id === input.selectedNodeId) ?? null;

  const anchorNode = selectedNode ?? nonTriggerNodes.at(-1) ?? triggerNode;
  const baseX = (anchorNode?.position.x ?? 40) + 280;
  let nextY = anchorNode?.position.y ?? 210;

  const occupied = new Set(
    nonTriggerNodes
      .filter((node) => Math.round(node.position.x) === Math.round(baseX))
      .map((node) => Math.round(node.position.y)),
  );

  while (occupied.has(Math.round(nextY))) {
    nextY += 170;
  }

  return {
    x: baseX,
    y: nextY,
  };
}

function buildTriggerEditorNode(): TriggerEditorNode {
  return {
    id: TRIGGER_NODE_ID,
    type: "trigger",
    position: { x: 40, y: 210 },
    data: { kind: "trigger" },
    deletable: false,
    selectable: true,
    draggable: false,
  };
}

function toEditorNodes(input: {
  graph: WorkflowGraphDocument;
  actions: readonly WorkflowActionCatalogItem[];
}): EditorNode[] {
  const graphNodes = Array.isArray(input.graph.nodes) ? input.graph.nodes : [];
  const nodes: EditorNode[] = [buildTriggerEditorNode()];

  for (const [index, graphNode] of graphNodes.entries()) {
    const rawNode = graphNode as WorkflowGraphNode & {
      label?: string;
      position?: unknown;
    };

    const position = isRecord(rawNode.position)
      ? {
          x:
            typeof rawNode.position["x"] === "number"
              ? rawNode.position["x"]
              : getGridPosition(index).x,
          y:
            typeof rawNode.position["y"] === "number"
              ? rawNode.position["y"]
              : getGridPosition(index).y,
        }
      : getGridPosition(index);

    if (rawNode.kind === "action") {
      const action =
        input.actions.find((entry) => entry.id === rawNode.actionId) ?? null;
      nodes.push({
        id: rawNode.id,
        type: "action",
        position,
        data: {
          kind: "action",
          label:
            typeof rawNode.label === "string"
              ? rawNode.label
              : (action?.label ?? "Action"),
          actionId: rawNode.actionId,
          integrationKey: rawNode.integrationKey,
          input: isRecord(rawNode.input) ? rawNode.input : {},
          ...(rawNode.guard ? { guard: rawNode.guard } : {}),
        },
      });
      continue;
    }

    if (rawNode.kind === "wait") {
      nodes.push({
        id: rawNode.id,
        type: "wait",
        position,
        data: {
          kind: "wait",
          label: typeof rawNode.label === "string" ? rawNode.label : "Wait",
          wait: rawNode.wait,
        },
      });
      continue;
    }

    if (rawNode.kind === "condition") {
      nodes.push({
        id: rawNode.id,
        type: "condition",
        position,
        data: {
          kind: "condition",
          label:
            typeof rawNode.label === "string" ? rawNode.label : "Condition",
          guard: rawNode.guard,
        },
      });
    }
  }

  return nodes;
}

function toEditorEdges(graph: WorkflowGraphDocument): EditorEdge[] {
  const graphEdges = Array.isArray(graph.edges) ? graph.edges : [];
  const persistedEdges = graphEdges.flatMap((edge) => {
    if (
      edge.source === TRIGGER_NODE_ID ||
      edge.target === TRIGGER_NODE_ID ||
      !edge.source ||
      !edge.target
    ) {
      return [];
    }

    const branch = edge.branch;
    const hasBranch =
      branch === "next" ||
      branch === "timeout" ||
      branch === "true" ||
      branch === "false";

    return [
      {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
        label: branch === "true" || branch === "false" ? branch : undefined,
        data: hasBranch ? { branch } : {},
      } satisfies EditorEdge,
    ];
  });

  const nodeIds = new Set(
    (Array.isArray(graph.nodes) ? graph.nodes : [])
      .map((node) => node.id)
      .filter((value): value is string => typeof value === "string"),
  );
  const incoming = new Map<string, number>();
  for (const nodeId of nodeIds) {
    incoming.set(nodeId, 0);
  }
  for (const edge of persistedEdges) {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }

  const virtualTriggerEdges: EditorEdge[] = [];
  for (const [nodeId, count] of incoming) {
    if (count === 0) {
      virtualTriggerEdges.push({
        id: `trigger_edge_${nodeId}`,
        source: TRIGGER_NODE_ID,
        target: nodeId,
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
        data: {
          virtualTrigger: true,
        },
      });
    }
  }

  return [...virtualTriggerEdges, ...persistedEdges];
}

function TriggerNodeComponent({ selected }: NodeProps<TriggerEditorNode>) {
  return (
    <FlowNode
      className={cn(
        "flex h-48 w-48 flex-col items-center justify-center border-border shadow-none transition-all duration-150 ease-out",
        selected && "border-primary",
      )}
      handles={{ target: false, source: true }}
    >
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Icon icon={Flowchart01Icon} className="size-12 text-blue-500" />
        <div className="flex flex-col items-center gap-1">
          <NodeTitle>Trigger</NodeTitle>
          <NodeDescription>Configure trigger in properties.</NodeDescription>
        </div>
      </div>
    </FlowNode>
  );
}

function ActionNodeComponent({ data, selected }: NodeProps<ActionEditorNode>) {
  return (
    <FlowNode
      className={cn(
        "flex h-48 w-48 flex-col items-center justify-center border-border shadow-none transition-all duration-150 ease-out",
        selected && "border-primary",
      )}
      handles={{ target: true, source: true }}
    >
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Icon icon={ZapIcon} className="size-12 text-amber-300" />
        <div className="flex flex-col items-center gap-1">
          <NodeTitle>{data.label || "Action"}</NodeTitle>
          <NodeDescription className="max-w-[10.5rem] truncate">
            {data.actionId}
          </NodeDescription>
        </div>
      </div>
    </FlowNode>
  );
}

function WaitNodeComponent({ data, selected }: NodeProps<WaitEditorNode>) {
  return (
    <FlowNode
      className={cn(
        "flex h-48 w-48 flex-col items-center justify-center border-border shadow-none transition-all duration-150 ease-out",
        selected && "border-primary",
      )}
      handles={{ target: true, source: true }}
    >
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Icon icon={HourglassIcon} className="size-12 text-orange-300" />
        <div className="flex flex-col items-center gap-1">
          <NodeTitle>{data.label || "Wait"}</NodeTitle>
          <NodeDescription>
            {data.wait.duration || "Set wait duration"}
          </NodeDescription>
        </div>
      </div>
    </FlowNode>
  );
}

function ConditionNodeComponent({
  data,
  selected,
}: NodeProps<ConditionEditorNode>) {
  return (
    <FlowNode
      className={cn(
        "flex h-48 w-48 flex-col items-center justify-center border-border shadow-none transition-all duration-150 ease-out",
        selected && "border-primary",
      )}
      handles={{ target: true, source: true }}
    >
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Icon icon={GitBranchIcon} className="size-12 text-pink-300" />
        <div className="flex flex-col items-center gap-1">
          <NodeTitle>{data.label || "Condition"}</NodeTitle>
          <NodeDescription>
            {data.guard.conditions.length} condition
            {data.guard.conditions.length === 1 ? "" : "s"}
          </NodeDescription>
        </div>
      </div>
    </FlowNode>
  );
}

function FlowCanvas(props: {
  readOnly: boolean;
  actions: readonly WorkflowActionCatalogItem[];
}) {
  const [nodes, setNodes] = useAtom(editorNodesAtom);
  const [edges, setEdges] = useAtom(editorEdgesAtom);
  const [, setSelectedNodeId] = useAtom(selectedNodeIdAtom);
  const [, setSelectedEdgeId] = useAtom(selectedEdgeIdAtom);
  const { screenToFlowPosition } = useReactFlow();
  const connectingNodeId = useRef<string | null>(null);
  const connectingHandleType = useRef<"source" | "target" | null>(null);
  const justCreatedNodeFromConnection = useRef(false);

  const nodeTypes = useMemo(
    () => ({
      trigger: TriggerNodeComponent,
      action: ActionNodeComponent,
      wait: WaitNodeComponent,
      condition: ConditionNodeComponent,
    }),
    [],
  );
  const edgeTypes = useMemo(
    () => ({
      animated: FlowEdge.Animated,
      temporary: FlowEdge.Temporary,
    }),
    [],
  );

  const createEdgeForConnection = useCallback(
    (
      connection: Connection,
      edgeList: readonly EditorEdge[],
      nodeList: readonly EditorNode[] = nodes,
    ) => {
      if (!connection.source || !connection.target) return null;
      if (connection.source === connection.target) return null;

      const sourceNode = nodeList.find((node) => node.id === connection.source);
      const targetNode = nodeList.find((node) => node.id === connection.target);
      if (!(sourceNode && targetNode)) return null;

      let branch: BranchType | undefined;
      if (sourceNode.type === "condition") {
        const existingConditionEdges = edgeList.filter(
          (edge) =>
            edge.source === connection.source &&
            edge.data?.virtualTrigger !== true,
        );
        if (existingConditionEdges.length >= 2) {
          return null;
        }
        branch = existingConditionEdges.length === 0 ? "true" : "false";
      }

      const nextEdge: EditorEdge = {
        id: `edge_${nanoid(8)}`,
        ...connection,
        type: "animated",
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
        ...(branch ? { label: branch } : {}),
        data:
          connection.source === TRIGGER_NODE_ID
            ? { virtualTrigger: true }
            : branch
              ? { branch }
              : {},
      };

      return nextEdge;
    },
    [nodes],
  );

  function onNodesChange(changes: NodeChange<EditorNode>[]) {
    if (props.readOnly) return;

    const filtered = changes.filter((change) => {
      if (change.type !== "remove") return true;
      return change.id !== TRIGGER_NODE_ID;
    });
    setNodes((current) => applyNodeChanges(filtered, current));
  }

  function onEdgesChange(changes: EdgeChange<EditorEdge>[]) {
    if (props.readOnly) return;
    setEdges((current) => applyEdgeChanges(changes, current));
  }

  function onConnect(connection: Connection) {
    if (props.readOnly) return;
    setEdges((current) => {
      const nextEdge = createEdgeForConnection(connection, current);
      if (!nextEdge) {
        return current;
      }
      return [...current, nextEdge];
    });
  }

  const nodeHasHandle = useCallback(
    (nodeId: string, handleType: "source" | "target") => {
      const node = nodes.find((entry) => entry.id === nodeId);
      if (!node) return false;

      if (handleType === "target") {
        return node.type !== "trigger";
      }
      return true;
    },
    [nodes],
  );

  const onConnectStart = useCallback(
    (_event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
      connectingNodeId.current = params.nodeId ?? null;
      connectingHandleType.current =
        params.handleType === "source" || params.handleType === "target"
          ? params.handleType
          : null;
    },
    [],
  );

  const getClientPosition = useCallback((event: MouseEvent | TouchEvent) => {
    if ("changedTouches" in event) {
      const touch = event.changedTouches.item(0);
      return {
        clientX: touch?.clientX ?? 0,
        clientY: touch?.clientY ?? 0,
      };
    }

    return {
      clientX: event.clientX,
      clientY: event.clientY,
    };
  }, []);

  const handleConnectionToExistingNode = useCallback(
    (nodeElement: Element) => {
      const targetNodeId = nodeElement.getAttribute("data-id");
      const fromSource = connectingHandleType.current === "source";
      const requiredHandle = fromSource ? "target" : "source";
      const sourceNodeId = connectingNodeId.current;

      if (
        targetNodeId &&
        sourceNodeId &&
        targetNodeId !== sourceNodeId &&
        nodeHasHandle(targetNodeId, requiredHandle)
      ) {
        onConnect({
          source: fromSource ? sourceNodeId : targetNodeId,
          target: fromSource ? targetNodeId : sourceNodeId,
          sourceHandle: null,
          targetHandle: null,
        });
      }
    },
    [nodeHasHandle, onConnect],
  );

  const handleConnectionToNewNode = useCallback(
    (event: MouseEvent | TouchEvent, clientX: number, clientY: number) => {
      const sourceNodeId = connectingNodeId.current;
      if (!sourceNodeId) return;

      const reactFlowBounds = (event.target as Element)
        .closest(".react-flow")
        ?.getBoundingClientRect();

      const adjustedX = reactFlowBounds
        ? clientX - reactFlowBounds.left
        : clientX;
      const adjustedY = reactFlowBounds
        ? clientY - reactFlowBounds.top
        : clientY;

      const position = screenToFlowPosition({
        x: adjustedX,
        y: adjustedY,
      });
      position.y -= 96;

      const newNode: ActionEditorNode = {
        id: `node_${nanoid(8)}`,
        type: "action",
        position,
        data: getDefaultActionNodeData(props.actions),
        selected: true,
      };

      setNodes((current) => [
        ...current.map(
          (entry) => ({ ...entry, selected: false }) as EditorNode,
        ),
        newNode,
      ]);
      setSelectedNodeId(newNode.id);
      setSelectedEdgeId(null);

      const fromSource = connectingHandleType.current === "source";
      const connection: Connection = {
        source: fromSource ? sourceNodeId : newNode.id,
        target: fromSource ? newNode.id : sourceNodeId,
        sourceHandle: null,
        targetHandle: null,
      };

      setEdges((current) => {
        const edge = createEdgeForConnection(connection, current, [
          ...nodes,
          newNode,
        ]);
        if (!edge) {
          return current;
        }
        return [...current, edge];
      });

      justCreatedNodeFromConnection.current = true;
      setTimeout(() => {
        justCreatedNodeFromConnection.current = false;
      }, 100);
    },
    [
      createEdgeForConnection,
      props.actions,
      screenToFlowPosition,
      setEdges,
      setNodes,
      setSelectedEdgeId,
      setSelectedNodeId,
    ],
  );

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!connectingNodeId.current) return;

      const { clientX, clientY } = getClientPosition(event);
      const target =
        "changedTouches" in event
          ? document.elementFromPoint(clientX, clientY)
          : (event.target as Element);

      if (!target) {
        connectingNodeId.current = null;
        connectingHandleType.current = null;
        return;
      }

      const nodeElement = target.closest(".react-flow__node");
      const isHandle = target.closest(".react-flow__handle");

      if (nodeElement && !isHandle && connectingHandleType.current) {
        handleConnectionToExistingNode(nodeElement);
        connectingNodeId.current = null;
        connectingHandleType.current = null;
        return;
      }

      if (!(nodeElement || isHandle)) {
        handleConnectionToNewNode(event, clientX, clientY);
      }

      connectingNodeId.current = null;
      connectingHandleType.current = null;
    },
    [
      getClientPosition,
      handleConnectionToExistingNode,
      handleConnectionToNewNode,
    ],
  );

  const onPaneClick = useCallback(() => {
    if (justCreatedNodeFromConnection.current) {
      return;
    }
    setSelectedEdgeId(null);
    setSelectedNodeId(null);
  }, [setSelectedEdgeId, setSelectedNodeId]);

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: RFNode[] }) => {
      if (justCreatedNodeFromConnection.current && selectedNodes.length === 0) {
        return;
      }

      if (selectedNodes.length === 0) {
        setSelectedNodeId(null);
      } else if (selectedNodes.length === 1) {
        const [firstSelectedNode] = selectedNodes;
        if (firstSelectedNode) {
          setSelectedNodeId(firstSelectedNode.id);
          setSelectedEdgeId(null);
        }
      }
    },
    [setSelectedEdgeId, setSelectedNodeId],
  );

  return (
    <div
      className="relative h-full bg-background"
      data-testid="workflow-canvas"
    >
      <Canvas<EditorNode, EditorEdge>
        className="bg-background"
        connectionLineComponent={FlowConnection}
        connectionMode={ConnectionMode.Strict}
        edgeTypes={edgeTypes}
        elementsSelectable={!props.readOnly}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesConnectable={!props.readOnly}
        nodesDraggable={!props.readOnly}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={props.readOnly ? undefined : onConnect}
        onConnectEnd={props.readOnly ? undefined : onConnectEnd}
        onConnectStart={props.readOnly ? undefined : onConnectStart}
        deleteKeyCode={props.readOnly ? null : "Backspace"}
        onNodeClick={(_, node) => {
          setSelectedNodeId(node.id);
          setSelectedEdgeId(null);
        }}
        onEdgeClick={(_, edge) => {
          setSelectedEdgeId(edge.id);
          setSelectedNodeId(null);
        }}
        onPaneClick={onPaneClick}
        onSelectionChange={props.readOnly ? undefined : onSelectionChange}
      >
        <Panel
          className="workflow-controls-panel border-none bg-transparent p-0"
          position="bottom-left"
        >
          <FlowControls />
        </Panel>
      </Canvas>
    </div>
  );
}

function renderActionField(props: {
  field: Exclude<WorkflowActionConfigField, { type: "group" }>;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const field = props.field;
  const value = props.value;

  if (field.type === "select") {
    return (
      <Select
        value={typeof value === "string" ? value : ""}
        onValueChange={(nextValue) => props.onChange(nextValue)}
      >
        <SelectTrigger>
          <SelectValue placeholder={field.placeholder ?? "Select"} />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === "number") {
    return (
      <Input
        type="number"
        value={typeof value === "number" ? String(value) : ""}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          props.onChange(Number.isFinite(parsed) ? parsed : 0);
        }}
        placeholder={field.placeholder}
        disabled={props.disabled}
      />
    );
  }

  if (field.type === "template-textarea" || field.type === "text") {
    return (
      <Textarea
        value={typeof value === "string" ? value : ""}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={field.placeholder}
        rows={field.rows ?? 4}
        disabled={props.disabled}
      />
    );
  }

  return (
    <Input
      value={typeof value === "string" ? value : ""}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={field.placeholder}
      disabled={props.disabled}
    />
  );
}

function TriggerInspector(props: {
  triggerConfig: WorkflowTriggerConfig | null;
  domainTriggerCatalog: readonly Extract<
    WorkflowTriggerCatalogItem,
    { type: "domain_event" }
  >[];
  scheduleTriggerCatalog: Extract<
    WorkflowTriggerCatalogItem,
    { type: "schedule" }
  > | null;
  canEdit: boolean;
  isMutating: boolean;
  onChange: (trigger: WorkflowTriggerConfig | null) => void;
}) {
  const domainTrigger =
    props.triggerConfig?.type === "domain_event" ? props.triggerConfig : null;
  const scheduleTrigger =
    props.triggerConfig?.type === "schedule" ? props.triggerConfig : null;

  const selectedDomainCatalog = useMemo(() => {
    if (!domainTrigger) return null;
    return (
      props.domainTriggerCatalog.find(
        (trigger) => trigger.domain === domainTrigger.domain,
      ) ?? null
    );
  }, [props.domainTriggerCatalog, domainTrigger]);

  const availableDomainEvents = selectedDomainCatalog?.events ?? [];

  function setTriggerType(type: "domain_event" | "schedule") {
    if (type === "domain_event") {
      const firstDomain = props.domainTriggerCatalog[0];
      if (!firstDomain) {
        props.onChange(null);
        return;
      }
      props.onChange(buildDefaultDomainTrigger(firstDomain));
      return;
    }

    props.onChange(buildDefaultScheduleTrigger(props.scheduleTriggerCatalog));
  }

  function setDomain(domain: string | null) {
    if (!domain || !domainTrigger) return;
    const catalogItem = props.domainTriggerCatalog.find(
      (trigger) => trigger.domain === domain,
    );
    if (!catalogItem) return;

    const allowed = new Set(catalogItem.events);

    props.onChange({
      ...domainTrigger,
      domain: catalogItem.domain,
      startEvents: domainTrigger.startEvents.filter((eventType) =>
        allowed.has(eventType),
      ),
      restartEvents: domainTrigger.restartEvents.filter((eventType) =>
        allowed.has(eventType),
      ),
      stopEvents: domainTrigger.stopEvents.filter((eventType) =>
        allowed.has(eventType),
      ),
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Trigger Type</Label>
        <Select
          value={props.triggerConfig?.type ?? ""}
          onValueChange={(value) => {
            if (value === "domain_event" || value === "schedule") {
              setTriggerType(value);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select trigger" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="domain_event">Domain event</SelectItem>
            <SelectItem value="schedule">Schedule</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {domainTrigger ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Domain</Label>
            <Select
              value={domainTrigger.domain}
              onValueChange={(value) => setDomain(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select domain" />
              </SelectTrigger>
              <SelectContent>
                {props.domainTriggerCatalog.map((trigger) => (
                  <SelectItem key={trigger.domain} value={trigger.domain}>
                    {trigger.domain}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {availableDomainEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No domain events available for this domain.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-sm font-medium">Start events</p>
                <div className="space-y-2">
                  {availableDomainEvents.map((eventType) => (
                    <Checkbox
                      key={`start-${eventType}`}
                      checked={domainTrigger.startEvents.includes(eventType)}
                      onChange={(checked) =>
                        props.onChange(
                          updateDomainTriggerEventSet({
                            trigger: domainTrigger,
                            bucket: "start",
                            eventType,
                            checked,
                          }),
                        )
                      }
                      label={eventType}
                      disabled={!props.canEdit || props.isMutating}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-sm font-medium">Restart events</p>
                <div className="space-y-2">
                  {availableDomainEvents.map((eventType) => (
                    <Checkbox
                      key={`restart-${eventType}`}
                      checked={domainTrigger.restartEvents.includes(eventType)}
                      onChange={(checked) =>
                        props.onChange(
                          updateDomainTriggerEventSet({
                            trigger: domainTrigger,
                            bucket: "restart",
                            eventType,
                            checked,
                          }),
                        )
                      }
                      label={eventType}
                      disabled={!props.canEdit || props.isMutating}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-sm font-medium">Stop events</p>
                <div className="space-y-2">
                  {availableDomainEvents.map((eventType) => (
                    <Checkbox
                      key={`stop-${eventType}`}
                      checked={domainTrigger.stopEvents.includes(eventType)}
                      onChange={(checked) =>
                        props.onChange(
                          updateDomainTriggerEventSet({
                            trigger: domainTrigger,
                            bucket: "stop",
                            eventType,
                            checked,
                          }),
                        )
                      }
                      label={eventType}
                      disabled={!props.canEdit || props.isMutating}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {scheduleTrigger ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="schedule-expression">Cron expression</Label>
            <Input
              id="schedule-expression"
              value={scheduleTrigger.expression}
              onChange={(event) =>
                props.onChange({
                  ...scheduleTrigger,
                  expression: event.target.value,
                })
              }
              placeholder="*/15 * * * *"
              disabled={!props.canEdit || props.isMutating}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="schedule-timezone">Timezone</Label>
            <Input
              id="schedule-timezone"
              value={scheduleTrigger.timezone}
              onChange={(event) =>
                props.onChange({
                  ...scheduleTrigger,
                  timezone: event.target.value,
                })
              }
              placeholder="America/New_York"
              disabled={!props.canEdit || props.isMutating}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WorkflowDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workflowId } = Route.useParams();
  const isCreating = workflowId === "new";

  const [nodes, setNodes] = useAtom(editorNodesAtom);
  const [edges, setEdges] = useAtom(editorEdgesAtom);
  const [selectedNodeId, setSelectedNodeId] = useAtom(selectedNodeIdAtom);
  const [selectedEdgeId, setSelectedEdgeId] = useAtom(selectedEdgeIdAtom);

  const { data: session, isPending: isSessionPending } =
    authClient.useSession();
  const canQueryWorkflowData =
    !isSessionPending && !!session?.session.activeOrganizationId;

  const authContextQuery = useQuery({
    ...orpc.auth.me.queryOptions({}),
    enabled: canQueryWorkflowData,
    retry: false,
  });

  const definitionQuery = useQuery({
    ...orpc.workflows.getDefinition.queryOptions({
      input: { id: workflowId },
    }),
    enabled: canQueryWorkflowData && !isCreating,
    retry: false,
  });

  const catalogQuery = useQuery({
    ...orpc.workflows.catalog.queryOptions({ input: undefined }),
    enabled: canQueryWorkflowData,
    retry: false,
  });

  const runsQuery = useQuery({
    ...orpc.workflows.listRuns.queryOptions({
      input: {
        definitionId: isCreating ? undefined : workflowId,
        limit: 20,
      },
    }),
    enabled: canQueryWorkflowData && !isCreating,
    placeholderData: (previous) => previous,
  });

  const createDefinitionMutation = useMutation(
    orpc.workflows.createDefinition.mutationOptions(),
  );
  const updateDraftMutation = useMutation(
    orpc.workflows.updateDraft.mutationOptions(),
  );
  const validateDraftMutation = useMutation(
    orpc.workflows.validateDraft.mutationOptions(),
  );
  const publishDraftMutation = useMutation(
    orpc.workflows.publishDraft.mutationOptions(),
  );
  const runDraftMutation = useMutation(
    orpc.workflows.runDraft.mutationOptions(),
  );

  const canEdit = isAdminRole(authContextQuery.data?.role);
  const actionsCatalog = catalogQuery.data?.actions ?? [];
  const triggerCatalogItems = catalogQuery.data?.triggers ?? [];

  const domainTriggerCatalog = useMemo(
    () =>
      triggerCatalogItems.filter(
        (
          trigger,
        ): trigger is Extract<
          WorkflowTriggerCatalogItem,
          { type: "domain_event" }
        > => trigger.type === "domain_event",
      ),
    [triggerCatalogItems],
  );
  const scheduleTriggerCatalog = useMemo(
    () =>
      triggerCatalogItems.find(
        (
          trigger,
        ): trigger is Extract<
          WorkflowTriggerCatalogItem,
          { type: "schedule" }
        > => trigger.type === "schedule",
      ) ?? null,
    [triggerCatalogItems],
  );

  const [schemaVersionInput, setSchemaVersionInput] = useState(
    String(DEFAULT_SCHEMA_VERSION),
  );
  const [triggerConfig, setTriggerConfig] =
    useState<WorkflowTriggerConfig | null>(null);
  const [createKey, setCreateKey] = useState("");
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [baselineSnapshot, setBaselineSnapshot] = useState<string | null>(null);
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [validationResult, setValidationResult] =
    useState<WorkflowValidationResult | null>(null);
  const [manualRunEntityType, setManualRunEntityType] = useState<
    | "appointment"
    | "calendar"
    | "appointment_type"
    | "resource"
    | "location"
    | "client"
    | "workflow"
  >("appointment");
  const [manualRunEntityId, setManualRunEntityId] = useState("");
  const [panelTab, setPanelTab] = useState<"properties" | "runs">("properties");
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  const initializedFromDefinitionRef = useRef<string | null>(null);

  const resetEditorToTriggerNode = useCallback(() => {
    setNodes([buildTriggerEditorNode()]);
    setEdges([]);
    setSelectedNodeId(TRIGGER_NODE_ID);
    setSelectedEdgeId(null);
    setPanelTab("properties");
  }, [setEdges, setNodes, setSelectedEdgeId, setSelectedNodeId, setPanelTab]);

  function buildWorkflowGraphFromEditor(): WorkflowGraphDocument {
    const schemaVersionParsed = Number.parseInt(schemaVersionInput, 10);
    if (!Number.isFinite(schemaVersionParsed) || schemaVersionParsed <= 0) {
      throw new Error("Schema version must be a positive integer.");
    }

    const workflowNodes: WorkflowGraphDocument["nodes"] = [];
    for (const node of nodes) {
      if (node.id === TRIGGER_NODE_ID) {
        continue;
      }

      if (node.type === "action") {
        workflowNodes.push({
          id: node.id,
          kind: "action",
          label: node.data.label,
          actionId: node.data.actionId,
          integrationKey: node.data.integrationKey,
          input: node.data.input,
          ...(node.data.guard ? { guard: node.data.guard } : {}),
          position: node.position,
        });
        continue;
      }

      if (node.type === "wait") {
        workflowNodes.push({
          id: node.id,
          kind: "wait",
          label: node.data.label,
          wait: node.data.wait,
          position: node.position,
        });
        continue;
      }

      if (node.type === "condition") {
        workflowNodes.push({
          id: node.id,
          kind: "condition",
          label: node.data.label,
          guard: node.data.guard,
          position: node.position,
        });
      }
    }

    const workflowEdges = edges
      .filter(
        (edge) =>
          edge.source !== TRIGGER_NODE_ID &&
          edge.target !== TRIGGER_NODE_ID &&
          edge.data?.virtualTrigger !== true,
      )
      .map((edge) => {
        const branch = edge.data?.branch;
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          ...(branch ? { branch } : {}),
        };
      });

    return {
      schemaVersion: schemaVersionParsed,
      ...(triggerConfig ? { trigger: triggerConfig } : {}),
      nodes: workflowNodes,
      edges: workflowEdges,
    };
  }

  function snapshotGraph(graph: WorkflowGraphDocument): string {
    return JSON.stringify(graph);
  }

  const hasUnsavedChanges = useMemo(() => {
    if (isCreating) return true;
    if (!baselineSnapshot) return false;

    try {
      return snapshotGraph(buildWorkflowGraphFromEditor()) !== baselineSnapshot;
    } catch {
      return true;
    }
  }, [
    isCreating,
    baselineSnapshot,
    schemaVersionInput,
    triggerConfig,
    nodes,
    edges,
  ]);

  useEffect(() => {
    if (!isCreating) return;
    if (triggerConfig !== null) return;
    const firstDomainTrigger = domainTriggerCatalog[0];
    if (!firstDomainTrigger) return;
    setTriggerConfig(buildDefaultDomainTrigger(firstDomainTrigger));
  }, [isCreating, triggerConfig, domainTriggerCatalog]);

  useEffect(() => {
    if (!isCreating) return;
    resetEditorToTriggerNode();
  }, [isCreating, resetEditorToTriggerNode]);

  useEffect(() => {
    if (isCreating || !definitionQuery.data) return;

    const definition = definitionQuery.data;
    const initKey = `${definition.id}:${definition.draftRevision}`;
    if (initializedFromDefinitionRef.current === initKey) {
      return;
    }

    initializedFromDefinitionRef.current = initKey;
    const graph = definition.draftWorkflowGraph;

    const schemaVersion =
      typeof graph.schemaVersion === "number" && graph.schemaVersion > 0
        ? graph.schemaVersion
        : DEFAULT_SCHEMA_VERSION;
    setSchemaVersionInput(String(schemaVersion));
    setTriggerConfig(graph.trigger ?? null);

    const flowNodes = toEditorNodes({
      graph,
      actions: actionsCatalog,
    });
    const flowEdges = toEditorEdges(graph);
    setNodes(flowNodes);
    setEdges(flowEdges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);

    setBaselineSnapshot(
      snapshotGraph({
        schemaVersion,
        ...(graph.trigger ? { trigger: graph.trigger } : {}),
        nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
        edges: Array.isArray(graph.edges) ? graph.edges : [],
      }),
    );
    setValidationResult(null);
    setEditorMessage(null);
    setEditorError(null);
  }, [
    isCreating,
    definitionQuery.data,
    actionsCatalog,
    setEdges,
    setNodes,
    setSelectedEdgeId,
    setSelectedNodeId,
  ]);

  useEffect(() => {
    if (!isCreating) return;
    initializedFromDefinitionRef.current = null;
    setSchemaVersionInput(String(DEFAULT_SCHEMA_VERSION));
    setBaselineSnapshot(null);
    setValidationResult(null);
    setCreateName((current) => current || "New Workflow");
    setPanelTab("properties");
  }, [isCreating, setCreateName, setPanelTab]);

  function updateNodeData(nodeId: string, nextData: Partial<EditorNodeData>) {
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        return {
          ...node,
          data: {
            ...(node.data as Record<string, unknown>),
            ...(nextData as Record<string, unknown>),
          } as EditorNodeData,
        } as EditorNode;
      }),
    );
  }

  function addNode(kind: "action" | "wait" | "condition") {
    const id = `node_${nanoid(8)}`;
    const position = getNextNodePosition({
      nodes,
      selectedNodeId,
    });
    const nextNode: EditorNode =
      kind === "action"
        ? {
            id,
            type: "action",
            position,
            data: getDefaultActionNodeData(actionsCatalog),
          }
        : kind === "wait"
          ? {
              id,
              type: "wait",
              position,
              data: getDefaultWaitNodeData(),
            }
          : {
              id,
              type: "condition",
              position,
              data: getDefaultConditionNodeData(),
            };

    const hasTrigger = nodes.some((node) => node.id === TRIGGER_NODE_ID);
    if (!hasTrigger) {
      setNodes([buildTriggerEditorNode(), nextNode]);
      setEdges([
        {
          id: `trigger_edge_${id}`,
          source: TRIGGER_NODE_ID,
          target: id,
          type: "animated",
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
          data: {
            virtualTrigger: true,
          },
        },
      ]);
      setTriggerConfig((current) => {
        if (current) {
          return current;
        }
        const firstDomain = domainTriggerCatalog[0];
        if (firstDomain) {
          return buildDefaultDomainTrigger(firstDomain);
        }
        if (scheduleTriggerCatalog) {
          return buildDefaultScheduleTrigger(scheduleTriggerCatalog);
        }
        return null;
      });
    } else {
      setNodes((current) => [...current, nextNode]);
    }
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    setPanelTab("properties");
  }

  function deleteSelection() {
    if (!canEdit) return;
    if (selectedEdgeId) {
      setEdges((current) =>
        current.filter((edge) => edge.id !== selectedEdgeId),
      );
      setSelectedEdgeId(null);
      return;
    }
    if (!selectedNodeId || selectedNodeId === TRIGGER_NODE_ID) {
      return;
    }
    setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
    setEdges((current) =>
      current.filter(
        (edge) =>
          edge.source !== selectedNodeId && edge.target !== selectedNodeId,
      ),
    );
    setSelectedNodeId(TRIGGER_NODE_ID);
  }

  async function handleCreateWorkflow() {
    setEditorMessage(null);
    setEditorError(null);
    setValidationResult(null);

    if (!canEdit) {
      setEditorError("Only admins can create workflows.");
      return;
    }

    try {
      const workflowGraph = buildWorkflowGraphFromEditor();
      const created = await createDefinitionMutation.mutateAsync({
        key: createKey,
        name: createName,
        description: createDescription.trim() ? createDescription : undefined,
        workflowGraph,
      });

      await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
      await navigate({
        to: "/workflows/$workflowId",
        params: { workflowId: created.id },
      });
    } catch (error: unknown) {
      const message = getErrorMessage(
        error,
        "Failed to create workflow draft.",
      );
      setEditorError(message);
      toast.error(message);
    }
  }

  async function handleSaveDraft(): Promise<{
    id: string;
    draftRevision: number;
  } | null> {
    if (isCreating) return null;
    if (!definitionQuery.data) return null;

    setEditorMessage(null);
    setEditorError(null);

    if (!canEdit) {
      setEditorError("This workflow is read-only for your role.");
      return null;
    }

    try {
      const workflowGraph = buildWorkflowGraphFromEditor();
      const updated = await updateDraftMutation.mutateAsync({
        id: definitionQuery.data.id,
        expectedRevision: definitionQuery.data.draftRevision,
        workflowGraph,
      });

      await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
      await definitionQuery.refetch();
      setEditorMessage("Draft saved.");
      setValidationResult(null);
      setBaselineSnapshot(snapshotGraph(workflowGraph));
      return {
        id: updated.id,
        draftRevision: updated.draftRevision,
      };
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to save workflow draft.");
      setEditorError(message);
      toast.error(message);
      return null;
    }
  }

  async function handleValidateDraft() {
    if (isCreating) return;
    if (!definitionQuery.data) return;

    setEditorMessage(null);
    setEditorError(null);

    if (!canEdit) {
      setEditorError("This workflow is read-only for your role.");
      return;
    }

    try {
      let targetDefinitionId = definitionQuery.data.id;

      if (hasUnsavedChanges) {
        const workflowGraph = buildWorkflowGraphFromEditor();
        const saved = await updateDraftMutation.mutateAsync({
          id: definitionQuery.data.id,
          expectedRevision: definitionQuery.data.draftRevision,
          workflowGraph,
        });
        targetDefinitionId = saved.id;
        setBaselineSnapshot(snapshotGraph(workflowGraph));
      }

      const result = await validateDraftMutation.mutateAsync({
        id: targetDefinitionId,
      });

      await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
      await definitionQuery.refetch();
      setValidationResult(result);
      setEditorMessage(
        result.valid ? "Draft is valid." : "Draft has validation issues.",
      );
    } catch (error: unknown) {
      const message = getErrorMessage(
        error,
        "Failed to validate workflow draft.",
      );
      setEditorError(message);
      toast.error(message);
    }
  }

  async function handlePublishDraft() {
    if (isCreating) return;
    if (!definitionQuery.data) return;

    setEditorMessage(null);
    setEditorError(null);

    if (!canEdit) {
      setEditorError("This workflow is read-only for your role.");
      return;
    }

    try {
      let targetRevision = definitionQuery.data.draftRevision;

      if (hasUnsavedChanges) {
        const workflowGraph = buildWorkflowGraphFromEditor();
        const saved = await updateDraftMutation.mutateAsync({
          id: definitionQuery.data.id,
          expectedRevision: definitionQuery.data.draftRevision,
          workflowGraph,
        });

        targetRevision = saved.draftRevision;
        setBaselineSnapshot(snapshotGraph(workflowGraph));
      }

      await publishDraftMutation.mutateAsync({
        id: definitionQuery.data.id,
        expectedRevision: targetRevision,
      });

      await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
      await definitionQuery.refetch();
      setValidationResult(null);
      setEditorMessage("Draft published.");
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to publish draft.");
      setEditorError(message);
      toast.error(message);
    }
  }

  async function handleRunDraft() {
    if (isCreating || !definitionQuery.data) return;
    if (!canEdit) {
      setEditorError("Only admins can run draft workflows.");
      return;
    }

    setEditorMessage(null);
    setEditorError(null);

    try {
      if (hasUnsavedChanges) {
        await handleSaveDraft();
      }

      await runDraftMutation.mutateAsync({
        id: definitionQuery.data.id,
        entityType: manualRunEntityType,
        entityId: manualRunEntityId.trim(),
      });

      setEditorMessage("Draft run triggered.");
      await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
      await runsQuery.refetch();
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to run workflow draft.");
      setEditorError(message);
      toast.error(message);
    }
  }

  const isMutating =
    createDefinitionMutation.isPending ||
    updateDraftMutation.isPending ||
    validateDraftMutation.isPending ||
    publishDraftMutation.isPending ||
    runDraftMutation.isPending;

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const hasSelection =
    !!selectedEdgeId ||
    (!!selectedNodeId && selectedNodeId !== TRIGGER_NODE_ID);
  const canCreateWorkflow =
    createKey.trim().length > 0 && createName.trim().length > 0;

  async function handleSaveOrCreate() {
    if (isCreating) {
      await handleCreateWorkflow();
      return;
    }
    await handleSaveDraft();
  }

  function handleClearWorkflowCanvas() {
    if (!canEdit || isMutating) return;
    resetEditorToTriggerNode();
  }

  if (!canQueryWorkflowData) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center bg-background text-sm text-muted-foreground">
        Loading organization context...
      </div>
    );
  }

  if (!isCreating && definitionQuery.isPending) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center bg-background text-sm text-muted-foreground">
        Loading workflow...
      </div>
    );
  }

  if (!isCreating && definitionQuery.error) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center bg-background px-6">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {getErrorMessage(definitionQuery.error, "Failed to load workflow.")}
        </div>
      </div>
    );
  }

  const definition = isCreating ? null : definitionQuery.data;

  return (
    <div className="workflow-editor-root h-[calc(100dvh-3.5rem)] w-full">
      <div className="flex h-full min-h-0 overflow-hidden bg-background text-foreground">
        <div className="relative min-h-0 flex-1">
          <Panel
            className="flex items-center gap-2 rounded-none border-none bg-transparent p-0"
            position="top-left"
          >
            <Button
              variant="secondary"
              size="sm"
              className="h-9 border bg-secondary hover:bg-secondary"
              asChild
            >
              <Link to="/workflows">
                <Icon icon={Flowchart01Icon} className="size-4" />
                {isCreating ? "New Workflow" : (definition?.name ?? "Workflow")}
              </Link>
            </Button>
            {!isCreating && definition ? (
              <Badge variant={definitionStatusBadgeVariant(definition.status)}>
                {definition.status}
              </Badge>
            ) : null}
            {!canEdit ? <Badge variant="outline">Read-only</Badge> : null}
          </Panel>

          <div className="pointer-events-auto absolute top-4 right-4 z-10 flex items-center gap-2">
            <Popover.Root open={isAddMenuOpen} onOpenChange={setIsAddMenuOpen}>
              <Popover.Trigger
                render={
                  <Button
                    className="h-9 border hover:bg-secondary"
                    disabled={isMutating || !canEdit}
                    size="icon-sm"
                    title="Add step"
                    variant="secondary"
                  >
                    <Icon icon={Add01Icon} className="size-4" />
                  </Button>
                }
              />
              <Popover.Portal>
                <Popover.Positioner align="end" side="bottom" sideOffset={6}>
                  <Popover.Popup className="z-20 min-w-40 rounded-md border border-border bg-background p-1 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 duration-100">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                      onClick={() => {
                        addNode("action");
                        setIsAddMenuOpen(false);
                      }}
                    >
                      <Icon icon={ZapIcon} className="size-4 text-amber-300" />
                      Add Action
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                      onClick={() => {
                        addNode("wait");
                        setIsAddMenuOpen(false);
                      }}
                    >
                      <Icon
                        icon={HourglassIcon}
                        className="size-4 text-orange-300"
                      />
                      Add Wait
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                      onClick={() => {
                        addNode("condition");
                        setIsAddMenuOpen(false);
                      }}
                    >
                      <Icon
                        icon={GitBranchIcon}
                        className="size-4 text-pink-300"
                      />
                      Add Condition
                    </button>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
            <Button
              className="h-9 border hover:bg-secondary"
              disabled={isMutating || !canEdit || !hasSelection}
              onClick={deleteSelection}
              size="icon-sm"
              title="Delete selection"
              variant="secondary"
            >
              <Icon icon={Delete01Icon} className="size-4" />
            </Button>
            {!isCreating ? (
              <Button
                className="h-9 border hover:bg-secondary"
                disabled={isMutating || !canEdit}
                onClick={handleValidateDraft}
                size="icon-sm"
                title="Validate"
                variant="secondary"
              >
                <Icon icon={CheckmarkCircle02Icon} className="size-4" />
              </Button>
            ) : null}
            <Button
              className="h-9 border hover:bg-secondary"
              disabled={
                isMutating || !canEdit || (isCreating && !canCreateWorkflow)
              }
              onClick={() => {
                void handleSaveOrCreate();
              }}
              size="icon-sm"
              title={isCreating ? "Create workflow" : "Save draft"}
              variant="secondary"
            >
              <Icon icon={FloppyDiskIcon} className="size-4" />
            </Button>
            {!isCreating ? (
              <Button
                className="h-9 border hover:bg-secondary"
                disabled={
                  isMutating ||
                  !canEdit ||
                  manualRunEntityId.trim().length === 0
                }
                onClick={() => {
                  void handleRunDraft();
                }}
                size="icon-sm"
                title="Run draft"
                variant="secondary"
              >
                <Icon icon={PlayIcon} className="size-4" />
              </Button>
            ) : null}
            {!isCreating ? (
              <Button
                className="h-9 border hover:bg-secondary"
                disabled={isMutating || !canEdit}
                onClick={handlePublishDraft}
                size="icon-sm"
                title="Publish"
                variant="secondary"
              >
                <Icon icon={Rocket01Icon} className="size-4" />
              </Button>
            ) : null}
          </div>

          {editorMessage || editorError ? (
            <div className="pointer-events-none absolute top-16 right-4 z-10 space-y-1 text-right">
              {editorMessage ? (
                <p className="text-xs text-emerald-600">{editorMessage}</p>
              ) : null}
              {editorError ? (
                <p className="text-xs text-destructive">{editorError}</p>
              ) : null}
            </div>
          ) : null}

          <ReactFlowProvider>
            <FlowCanvas
              readOnly={isMutating || !canEdit}
              actions={actionsCatalog}
            />
          </ReactFlowProvider>
        </div>

        <aside className="flex h-full w-[430px] min-w-[430px] flex-col border-l border-border bg-background">
          <div className="shrink-0 border-b border-border px-4 py-2.5">
            <div className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
              <button
                type="button"
                onClick={() => setPanelTab("properties")}
                className={cn(
                  "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-sm px-2 py-1 text-sm font-medium transition-[color,box-shadow]",
                  panelTab === "properties"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                Properties
              </button>
              <button
                type="button"
                onClick={() => setPanelTab("runs")}
                className={cn(
                  "inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-sm px-2 py-1 text-sm font-medium transition-[color,box-shadow]",
                  panelTab === "runs"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                Runs
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {panelTab === "properties" ? (
              <>
                {selectedEdge ? (
                  <div className="space-y-2 rounded-md border border-border p-3">
                    <p className="text-sm font-medium">Selected edge</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedEdge.source} → {selectedEdge.target}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Branch: {selectedEdge.data?.branch ?? "next"}
                    </p>
                  </div>
                ) : selectedNode?.type === "action" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Label</Label>
                      <Input
                        value={selectedNode.data.label}
                        onChange={(event) =>
                          updateNodeData(selectedNode.id, {
                            label: event.target.value,
                          })
                        }
                        disabled={!canEdit || isMutating}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Action</Label>
                      <Select
                        value={selectedNode.data.actionId}
                        onValueChange={(actionId) => {
                          const action =
                            actionsCatalog.find(
                              (entry) => entry.id === actionId,
                            ) ?? null;
                          if (!action) return;

                          updateNodeData(selectedNode.id, {
                            actionId: action.id,
                            integrationKey: action.integrationKey,
                            label: action.label,
                            input: resolveActionInputDefaults(action),
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {actionsCatalog.map((action) => (
                            <SelectItem key={action.id} value={action.id}>
                              {action.label} ({action.integrationKey})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {(
                      actionsCatalog.find(
                        (entry) => entry.id === selectedNode.data.actionId,
                      )?.configFields ?? []
                    ).map((field) => {
                      if ("fields" in field) {
                        return (
                          <div
                            key={`group-${field.label}`}
                            className="space-y-2 rounded-md border border-border p-3"
                          >
                            <p className="text-sm font-medium">{field.label}</p>
                            {field.fields.map((nestedField) => (
                              <div key={nestedField.key} className="space-y-2">
                                <Label>{nestedField.label}</Label>
                                {renderActionField({
                                  field: nestedField,
                                  value:
                                    selectedNode.data.input[nestedField.key],
                                  disabled: !canEdit || isMutating,
                                  onChange: (value) =>
                                    updateNodeData(selectedNode.id, {
                                      input: {
                                        ...selectedNode.data.input,
                                        [nestedField.key]: value,
                                      },
                                    }),
                                })}
                              </div>
                            ))}
                          </div>
                        );
                      }

                      return (
                        <div key={field.key} className="space-y-2">
                          <Label>{field.label}</Label>
                          {renderActionField({
                            field,
                            value: selectedNode.data.input[field.key],
                            disabled: !canEdit || isMutating,
                            onChange: (value) =>
                              updateNodeData(selectedNode.id, {
                                input: {
                                  ...selectedNode.data.input,
                                  [field.key]: value,
                                },
                              }),
                          })}
                        </div>
                      );
                    })}
                  </div>
                ) : selectedNode?.type === "wait" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Label</Label>
                      <Input
                        value={selectedNode.data.label}
                        onChange={(event) =>
                          updateNodeData(selectedNode.id, {
                            label: event.target.value,
                          })
                        }
                        disabled={!canEdit || isMutating}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Duration</Label>
                      <Input
                        value={selectedNode.data.wait.duration}
                        onChange={(event) =>
                          updateNodeData(selectedNode.id, {
                            wait: {
                              ...selectedNode.data.wait,
                              duration: event.target.value,
                            },
                          })
                        }
                        placeholder="PT1H"
                        disabled={!canEdit || isMutating}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Reference Field (optional)</Label>
                      <Input
                        value={selectedNode.data.wait.referenceField ?? ""}
                        onChange={(event) =>
                          updateNodeData(selectedNode.id, {
                            wait: {
                              ...selectedNode.data.wait,
                              referenceField: event.target.value || undefined,
                            },
                          })
                        }
                        placeholder="startAt"
                        disabled={!canEdit || isMutating}
                      />
                    </div>
                  </div>
                ) : selectedNode?.type === "condition" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Label</Label>
                      <Input
                        value={selectedNode.data.label}
                        onChange={(event) =>
                          updateNodeData(selectedNode.id, {
                            label: event.target.value,
                          })
                        }
                        disabled={!canEdit || isMutating}
                      />
                    </div>
                    {selectedNode.data.guard.conditions.map(
                      (condition, index) => (
                        <div
                          key={`${selectedNode.id}-condition-${index}`}
                          className="space-y-2 rounded-md border border-border p-3"
                        >
                          <Input
                            value={condition.field}
                            onChange={(event) => {
                              const nextConditions =
                                selectedNode.data.guard.conditions.map(
                                  (
                                    entry: WorkflowGuardCondition,
                                    entryIndex: number,
                                  ) =>
                                    entryIndex === index
                                      ? {
                                          ...entry,
                                          field: event.target.value,
                                        }
                                      : entry,
                                );
                              updateNodeData(selectedNode.id, {
                                guard: {
                                  ...selectedNode.data.guard,
                                  conditions: nextConditions,
                                },
                              });
                            }}
                            placeholder="field"
                            disabled={!canEdit || isMutating}
                          />
                        </div>
                      ),
                    )}
                  </div>
                ) : selectedNode?.type === "trigger" ? (
                  <TriggerInspector
                    triggerConfig={triggerConfig}
                    domainTriggerCatalog={domainTriggerCatalog}
                    scheduleTriggerCatalog={scheduleTriggerCatalog}
                    canEdit={canEdit}
                    isMutating={isMutating}
                    onChange={setTriggerConfig}
                  />
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="workflow-name">Workflow Name</Label>
                      <Input
                        id="workflow-name"
                        value={
                          isCreating ? createName : (definition?.name ?? "")
                        }
                        onChange={(event) => {
                          if (!isCreating) return;
                          setCreateName(event.target.value);
                        }}
                        disabled={!isCreating || isMutating || !canEdit}
                      />
                    </div>

                    {isCreating ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="workflow-key">Workflow Key</Label>
                          <Input
                            id="workflow-key"
                            value={createKey}
                            onChange={(event) =>
                              setCreateKey(event.target.value)
                            }
                            placeholder="workflow_key"
                            disabled={isMutating || !canEdit}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="workflow-description">
                            Description
                          </Label>
                          <Input
                            id="workflow-description"
                            value={createDescription}
                            onChange={(event) =>
                              setCreateDescription(event.target.value)
                            }
                            placeholder="Optional description"
                            disabled={isMutating || !canEdit}
                          />
                        </div>
                      </>
                    ) : null}

                    <div className="space-y-2">
                      <Label htmlFor="workflow-id">Workflow ID</Label>
                      <Input
                        id="workflow-id"
                        disabled
                        value={
                          isCreating
                            ? "Not saved"
                            : (definition?.id ?? "Not saved")
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="graph-schema-version">
                        Schema version
                      </Label>
                      <Input
                        id="graph-schema-version"
                        value={schemaVersionInput}
                        onChange={(event) =>
                          setSchemaVersionInput(event.target.value)
                        }
                        disabled={isMutating || !canEdit}
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        className="text-muted-foreground"
                        size="sm"
                        variant="ghost"
                        disabled={!canEdit || isMutating}
                        onClick={handleClearWorkflowCanvas}
                      >
                        Clear
                      </Button>
                      <Button
                        className="text-muted-foreground"
                        size="sm"
                        variant="ghost"
                        disabled
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                )}

                {!isCreating && definition ? (
                  <div className="space-y-3 border-t border-border pt-4">
                    <p className="text-sm font-medium">Run Draft</p>
                    <Select
                      value={manualRunEntityType}
                      onValueChange={(value) => {
                        if (
                          value === "appointment" ||
                          value === "calendar" ||
                          value === "appointment_type" ||
                          value === "resource" ||
                          value === "location" ||
                          value === "client" ||
                          value === "workflow"
                        ) {
                          setManualRunEntityType(value);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="appointment">appointment</SelectItem>
                        <SelectItem value="calendar">calendar</SelectItem>
                        <SelectItem value="appointment_type">
                          appointment_type
                        </SelectItem>
                        <SelectItem value="resource">resource</SelectItem>
                        <SelectItem value="location">location</SelectItem>
                        <SelectItem value="client">client</SelectItem>
                        <SelectItem value="workflow">workflow</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={manualRunEntityId}
                      onChange={(event) =>
                        setManualRunEntityId(event.target.value)
                      }
                      placeholder="Entity UUID"
                      disabled={!canEdit || isMutating}
                    />
                    <Button
                      variant="outline"
                      disabled={
                        !canEdit ||
                        isMutating ||
                        manualRunEntityId.trim().length === 0
                      }
                      onClick={() => {
                        void handleRunDraft();
                      }}
                    >
                      <Icon icon={PlayIcon} data-icon="inline-start" />
                      Run Draft
                    </Button>
                  </div>
                ) : null}

                {validationResult && !validationResult.valid ? (
                  <div className="space-y-2 border-t border-border pt-4">
                    <p className="text-sm font-medium">Validation</p>
                    {validationResult.issues.map((issue, index) => (
                      <div
                        key={`${issue.code}-${issue.message}-${index}`}
                        className="rounded-md border border-border p-2"
                      >
                        <p className="text-xs font-medium">{issue.code}</p>
                        <p className="text-xs text-muted-foreground">
                          {issue.message}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}

            {panelTab === "runs" && !isCreating && definition ? (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-medium">Runs</p>
                {runsQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">
                    Loading runs...
                  </p>
                ) : runsQuery.error ? (
                  <p className="text-xs text-destructive">
                    {getErrorMessage(runsQuery.error, "Failed to load runs.")}
                  </p>
                ) : (runsQuery.data?.items ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No runs yet.</p>
                ) : (
                  (runsQuery.data?.items ?? []).map((run) => (
                    <div
                      key={run.runId}
                      className="rounded-md border border-border px-2 py-1.5"
                    >
                      <p className="truncate text-xs font-medium">
                        {run.runId}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {run.workflowType} • {run.status}
                      </p>
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/workflows/$workflowId")({
  component: WorkflowDetailPage,
});
