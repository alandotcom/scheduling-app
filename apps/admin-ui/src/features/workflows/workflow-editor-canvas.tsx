import {
  type Connection as ReactFlowConnection,
  ConnectionMode,
  type Edge as ReactFlowEdge,
  type HandleType,
  type IsValidConnection,
  type OnConnectStartParams,
  useReactFlow,
} from "@xyflow/react";
import { useAtomValue, useSetAtom } from "jotai";
import { nanoid } from "nanoid";
import { useCallback, useMemo, useRef, useState } from "react";
import { Canvas } from "@/components/flow-elements/canvas";
import { Connection } from "@/components/flow-elements/connection";
import { Controls } from "@/components/flow-elements/controls";
import { Edge } from "@/components/flow-elements/edge";
import { Panel } from "@/components/flow-elements/panel";
import {
  type ContextMenuState,
  useWorkflowEditorContextMenuHandlers,
  WorkflowEditorContextMenu,
} from "./workflow-editor-context-menu";
import { ActionNode } from "./nodes/action-node";
import { AddNode } from "./nodes/add-node";
import { TriggerNode } from "./nodes/trigger-node";
import {
  addInitialTriggerNodeAtom,
  deleteEdgeAtom,
  onWorkflowEditorConnectAtom,
  onWorkflowEditorEdgesChangeAtom,
  onWorkflowEditorNodesChangeAtom,
  onWorkflowEditorReconnectAtom,
  propertiesPanelActiveTabAtom,
  rightPanelWidthAtom,
  setWorkflowEditorSelectionAtom,
  workflowEditorEdgesAtom,
  workflowEditorHasUnsavedChangesAtom,
  workflowEditorIsLoadedAtom,
  workflowEditorNodesAtom,
  type WorkflowCanvasNode,
} from "./workflow-editor-store";

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  add: AddNode,
};

const edgeTypes = {
  animated: Edge.Animated,
  temporary: Edge.Temporary,
};

const isValidConnection: IsValidConnection = (connection) =>
  connection.source !== connection.target;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConditionActionNode(node: WorkflowCanvasNode | undefined): boolean {
  if (!node || !isRecord(node.data) || node.data.type !== "action") {
    return false;
  }

  const config = isRecord(node.data.config) ? node.data.config : null;
  return (
    typeof config?.actionType === "string" &&
    config.actionType.trim().toLowerCase() === "condition"
  );
}

function normalizeConditionBranch(value: unknown): "true" | "false" | null {
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

function pickConditionBranchFromExistingEdges(input: {
  edges: Array<{ source: string; sourceHandle?: string | null }>;
  sourceNodeId: string;
}): "true" | "false" {
  const usedBranches = new Set<string>();

  for (const edge of input.edges) {
    if (edge.source !== input.sourceNodeId) {
      continue;
    }

    const branch = normalizeConditionBranch(edge.sourceHandle);
    if (branch) {
      usedBranches.add(branch);
    }
  }

  if (!usedBranches.has("true")) {
    return "true";
  }

  if (!usedBranches.has("false")) {
    return "false";
  }

  return "true";
}

interface WorkflowEditorCanvasProps {
  canEdit: boolean;
  children?: React.ReactNode;
}

export function WorkflowEditorCanvas({
  canEdit,
  children,
}: WorkflowEditorCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  const [contextMenuState, setContextMenuState] =
    useState<ContextMenuState>(null);

  const nodes = useAtomValue(workflowEditorNodesAtom);
  const edges = useAtomValue(workflowEditorEdgesAtom);
  const isLoaded = useAtomValue(workflowEditorIsLoadedAtom);
  const rightPanelWidth = useAtomValue(rightPanelWidthAtom);
  const onNodesChange = useSetAtom(onWorkflowEditorNodesChangeAtom);
  const onEdgesChange = useSetAtom(onWorkflowEditorEdgesChangeAtom);
  const onConnect = useSetAtom(onWorkflowEditorConnectAtom);
  const onReconnect = useSetAtom(onWorkflowEditorReconnectAtom);
  const deleteEdge = useSetAtom(deleteEdgeAtom);
  const setSelection = useSetAtom(setWorkflowEditorSelectionAtom);
  const setPropertiesPanelTab = useSetAtom(propertiesPanelActiveTabAtom);
  const setNodes = useSetAtom(workflowEditorNodesAtom);
  const setEdges = useSetAtom(workflowEditorEdgesAtom);
  const setHasUnsavedChanges = useSetAtom(workflowEditorHasUnsavedChangesAtom);
  const addInitialTrigger = useSetAtom(addInitialTriggerNodeAtom);
  const { onNodeContextMenu, onEdgeContextMenu, onPaneContextMenu } =
    useWorkflowEditorContextMenuHandlers(
      screenToFlowPosition,
      setContextMenuState,
    );

  const closeContextMenu = useCallback(() => {
    setContextMenuState(null);
  }, []);

  // Show empty-state placeholder when canvas is empty and editable
  const displayNodes = useMemo(() => {
    if (nodes.length === 0 && canEdit) {
      return [
        {
          id: "__empty-placeholder__",
          type: "add",
          position: { x: 0, y: 0 },
          data: {
            type: "add" as const,
            label: "Add a Step",
          },
          selectable: false,
          draggable: false,
        },
      ] satisfies WorkflowCanvasNode[];
    }
    return nodes;
  }, [nodes, canEdit]);

  // Handle clicks on nodes — React Flow's onNodeClick fires reliably
  // even when pointer events are intercepted by the node wrapper
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string }) => {
      if (node.id === "__empty-placeholder__") {
        addInitialTrigger();
      }
    },
    [addInitialTrigger],
  );

  // Connection-to-create-node refs
  const connectingNodeId = useRef<string | null>(null);
  const connectingHandleType = useRef<"source" | "target" | null>(null);
  const connectingHandleId = useRef<string | null>(null);
  const reconnectingEdgeId = useRef<string | null>(null);
  const edgeReconnectSuccessful = useRef(true);

  const clearConnectionInteraction = useCallback(() => {
    connectingNodeId.current = null;
    connectingHandleType.current = null;
    connectingHandleId.current = null;
    reconnectingEdgeId.current = null;
  }, []);

  // Animated edges mapping
  const edgesWithTypes = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        type: edge.type || "animated",
        animated: true,
        reconnectable: "target" as const,
      })),
    [edges],
  );

  const handleConnectStart = useCallback(
    (_event: MouseEvent | TouchEvent, params: OnConnectStartParams) => {
      connectingNodeId.current = params.nodeId;
      connectingHandleType.current = params.handleType;
      connectingHandleId.current = params.handleId ?? null;

      if (!(params.nodeId && params.handleType)) {
        reconnectingEdgeId.current = null;
        edgeReconnectSuccessful.current = true;
        return;
      }

      const handleId = params.handleId ?? null;
      const candidates =
        params.handleType === "target"
          ? edges.filter(
              (edge) =>
                edge.target === params.nodeId &&
                (edge.targetHandle ?? null) === handleId,
            )
          : [];

      reconnectingEdgeId.current =
        candidates.length === 1 ? (candidates[0]?.id ?? null) : null;
      edgeReconnectSuccessful.current = reconnectingEdgeId.current === null;
    },
    [edges],
  );

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!canEdit || !connectingNodeId.current) return;

      // Check if dropped on the canvas (not on a node)
      const targetElement =
        event instanceof MouseEvent
          ? document.elementFromPoint(event.clientX, event.clientY)
          : event.changedTouches?.[0]
            ? document.elementFromPoint(
                event.changedTouches[0].clientX,
                event.changedTouches[0].clientY,
              )
            : null;

      const isDroppedOnCanvas =
        targetElement?.classList.contains("react-flow__pane") ||
        targetElement?.closest(".react-flow__pane");

      if (isDroppedOnCanvas && reconnectingEdgeId.current) {
        deleteEdge(reconnectingEdgeId.current);
        edgeReconnectSuccessful.current = true;
        clearConnectionInteraction();
        return;
      }

      if (!isDroppedOnCanvas) {
        clearConnectionInteraction();
        return;
      }

      // Get position from event
      const clientX =
        event instanceof MouseEvent
          ? event.clientX
          : (event.changedTouches?.[0]?.clientX ?? 0);
      const clientY =
        event instanceof MouseEvent
          ? event.clientY
          : (event.changedTouches?.[0]?.clientY ?? 0);

      const position = screenToFlowPosition({ x: clientX, y: clientY });

      // Create new action node
      const newNodeId = nanoid();
      const newNode: WorkflowCanvasNode = {
        id: newNodeId,
        type: "action",
        position: { x: position.x - 96, y: position.y - 96 },
        data: {
          type: "action",
          label: "Action",
          status: "idle",
          config: {},
        },
      };

      // Create edge connecting the source to the new node
      const sourceId = connectingNodeId.current;
      const edgeId = nanoid();
      const sourceHandle =
        connectingHandleType.current === "source"
          ? connectingHandleId.current
          : null;
      const sourceNode = nodes.find((node) => node.id === sourceId);
      const sourceIsCondition = isConditionActionNode(sourceNode);

      setNodes((currentNodes) => [...currentNodes, newNode]);
      setEdges((currentEdges) => {
        const conditionBranch =
          sourceIsCondition && connectingHandleType.current === "source"
            ? (normalizeConditionBranch(sourceHandle) ??
              pickConditionBranchFromExistingEdges({
                edges: currentEdges,
                sourceNodeId: sourceId,
              }))
            : null;

        return [
          ...currentEdges,
          {
            id: edgeId,
            source:
              connectingHandleType.current === "source" ? sourceId : newNodeId,
            target:
              connectingHandleType.current === "source" ? newNodeId : sourceId,
            sourceHandle: conditionBranch ?? sourceHandle,
            targetHandle:
              connectingHandleType.current === "target"
                ? connectingHandleId.current
                : null,
            ...(conditionBranch
              ? {
                  label: conditionBranch === "true" ? "True" : "False",
                  data: { conditionBranch },
                }
              : {}),
            animated: true,
          },
        ];
      });
      setHasUnsavedChanges(true);
      setPropertiesPanelTab("properties");
      setSelection({ nodeId: newNodeId, edgeId: null });

      clearConnectionInteraction();
    },
    [
      canEdit,
      clearConnectionInteraction,
      deleteEdge,
      screenToFlowPosition,
      setNodes,
      setEdges,
      setHasUnsavedChanges,
      setPropertiesPanelTab,
      setSelection,
      nodes,
    ],
  );

  const handlePaneClick = useCallback(() => {
    closeContextMenu();
    setSelection({ nodeId: null, edgeId: null });
  }, [closeContextMenu, setSelection]);

  const handleCanvasConnect = useCallback(
    (connection: ReactFlowConnection) => {
      const reconnectingId = reconnectingEdgeId.current;
      if (reconnectingId) {
        const reconnecting = edges.find((edge) => edge.id === reconnectingId);

        if (reconnecting) {
          onReconnect({ oldEdge: reconnecting, newConnection: connection });
          edgeReconnectSuccessful.current = true;
          clearConnectionInteraction();
          return;
        }
      }

      onConnect(connection);
      clearConnectionInteraction();
    },
    [clearConnectionInteraction, edges, onConnect, onReconnect],
  );

  const handleReconnectStart = useCallback(
    (
      _event: React.MouseEvent,
      edge: { id: string },
      handleType: HandleType,
    ) => {
      if (handleType !== "target") {
        edgeReconnectSuccessful.current = true;
        reconnectingEdgeId.current = null;
        return;
      }

      reconnectingEdgeId.current = edge.id;
      edgeReconnectSuccessful.current = false;
    },
    [],
  );

  const handleReconnectEnd = useCallback(
    (
      _event: MouseEvent | TouchEvent,
      edge: { id: string },
      handleType: HandleType,
    ) => {
      if (handleType !== "target") {
        edgeReconnectSuccessful.current = true;
        reconnectingEdgeId.current = null;
        return;
      }

      if (!edgeReconnectSuccessful.current) {
        deleteEdge(edge.id);
      }

      edgeReconnectSuccessful.current = true;
      reconnectingEdgeId.current = null;
    },
    [deleteEdge],
  );

  const handleReconnect = useCallback(
    (oldEdge: ReactFlowEdge, newConnection: ReactFlowConnection) => {
      onReconnect({ oldEdge, newConnection });
      edgeReconnectSuccessful.current = true;
      clearConnectionInteraction();
    },
    [clearConnectionInteraction, onReconnect],
  );

  return (
    <div
      className="h-full transition-opacity duration-300"
      style={{
        opacity: isLoaded ? 1 : 0,
        width: rightPanelWidth ? `calc(100% - ${rightPanelWidth})` : "100%",
      }}
    >
      <Canvas
        nodes={displayNodes}
        edges={edgesWithTypes}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionLineComponent={Connection}
        connectionMode={ConnectionMode.Strict}
        isValidConnection={isValidConnection}
        minZoom={0.35}
        maxZoom={1.8}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        elementsSelectable
        deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
        onNodesChange={
          canEdit ? (changes) => onNodesChange(changes) : undefined
        }
        onEdgesChange={
          canEdit ? (changes) => onEdgesChange(changes) : undefined
        }
        onConnect={canEdit ? handleCanvasConnect : undefined}
        onReconnect={canEdit ? handleReconnect : undefined}
        onReconnectStart={canEdit ? handleReconnectStart : undefined}
        onReconnectEnd={canEdit ? handleReconnectEnd : undefined}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={canEdit ? onNodeContextMenu : undefined}
        onConnectStart={canEdit ? handleConnectStart : undefined}
        onConnectEnd={canEdit ? handleConnectEnd : undefined}
        onEdgeContextMenu={canEdit ? onEdgeContextMenu : undefined}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={canEdit ? onPaneContextMenu : undefined}
        onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
          setSelection({
            nodeId: selectedNodes.at(0)?.id ?? null,
            edgeId: selectedEdges.at(0)?.id ?? null,
          });
        }}
      >
        <Panel position="bottom-left">
          <Controls />
        </Panel>
        {children}
      </Canvas>

      <WorkflowEditorContextMenu
        menuState={canEdit ? contextMenuState : null}
        onClose={closeContextMenu}
      />
    </div>
  );
}
