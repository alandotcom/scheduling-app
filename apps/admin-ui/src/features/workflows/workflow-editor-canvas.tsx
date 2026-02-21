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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { layoutWorkflowNodes } from "./workflow-layout";
import {
  computeViewportForTriggerVisibility,
  isManualViewportCooldownActive,
} from "./workflow-viewport-anchor";
import {
  WORKFLOW_NODE_HEIGHT,
  WORKFLOW_NODE_WIDTH,
} from "./workflow-node-dimensions";
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
  workflowActiveCanvasEdgesAtom,
  workflowActiveCanvasNodesAtom,
  workflowEditorEdgesAtom,
  workflowEditorHasUnsavedChangesAtom,
  workflowEditorIsLoadedAtom,
  workflowEditorNodesAtom,
  workflowExecutionEdgeStatusByEdgeIdAtom,
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

function isTriggerNode(node: WorkflowCanvasNode | undefined): boolean {
  if (!node || !isRecord(node.data)) {
    return false;
  }

  return node.data.type === "trigger";
}

function isClientJourneyTriggerNode(
  node: WorkflowCanvasNode | undefined,
): boolean {
  if (!node || !isRecord(node.data) || !isRecord(node.data.config)) {
    return false;
  }

  const config = node.data.config;
  return (
    config.triggerType === "ClientJourney" ||
    config.event === "client.created" ||
    config.event === "client.updated" ||
    config.correlationKey === "clientId"
  );
}

function getClientTriggerEntryLabel(
  node: WorkflowCanvasNode | undefined,
): string {
  if (!node || !isRecord(node.data) || !isRecord(node.data.config)) {
    return "Created";
  }

  return node.data.config.event === "client.updated" ? "Updated" : "Created";
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

function normalizeTriggerBranch(
  value: unknown,
): "scheduled" | "canceled" | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "scheduled" || normalized === "canceled") {
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

function pickTriggerBranchFromExistingEdges(input: {
  edges: Array<{ source: string; sourceHandle?: string | null }>;
  sourceNodeId: string;
}): "scheduled" | "canceled" {
  const usedBranches = new Set<string>();

  for (const edge of input.edges) {
    if (edge.source !== input.sourceNodeId) {
      continue;
    }

    const branch = normalizeTriggerBranch(edge.sourceHandle);
    if (branch) {
      usedBranches.add(branch);
    }
  }

  if (!usedBranches.has("scheduled")) {
    return "scheduled";
  }

  if (!usedBranches.has("canceled")) {
    return "canceled";
  }

  return "scheduled";
}

interface WorkflowEditorCanvasProps {
  canEdit: boolean;
  children?: React.ReactNode;
}

export function WorkflowEditorCanvas({
  canEdit,
  children,
}: WorkflowEditorCanvasProps) {
  const { fitView, getViewport, screenToFlowPosition, setViewport } =
    useReactFlow();
  const [contextMenuState, setContextMenuState] =
    useState<ContextMenuState>(null);
  const [isReflowing, setIsReflowing] = useState(false);

  const nodes = useAtomValue(workflowActiveCanvasNodesAtom);
  const edges = useAtomValue(workflowActiveCanvasEdgesAtom);
  const executionEdgeStatusByEdgeId = useAtomValue(
    workflowExecutionEdgeStatusByEdgeIdAtom,
  );
  const isLoaded = useAtomValue(workflowEditorIsLoadedAtom);
  const rightPanelWidth = useAtomValue(rightPanelWidthAtom);
  const onNodesChange = useSetAtom(onWorkflowEditorNodesChangeAtom);
  const onEdgesChange = useSetAtom(onWorkflowEditorEdgesChangeAtom);
  const onConnect = useSetAtom(onWorkflowEditorConnectAtom);
  const onReconnect = useSetAtom(onWorkflowEditorReconnectAtom);
  const deleteEdge = useSetAtom(deleteEdgeAtom);
  const setSelection = useSetAtom(setWorkflowEditorSelectionAtom);
  const setPropertiesPanelTab = useSetAtom(propertiesPanelActiveTabAtom);
  const setEdges = useSetAtom(workflowEditorEdgesAtom);
  const setNodes = useSetAtom(workflowEditorNodesAtom);
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

  useEffect(() => {
    if (!canEdit || !isLoaded || nodes.length > 0) {
      return;
    }

    addInitialTrigger();
  }, [addInitialTrigger, canEdit, isLoaded, nodes.length]);

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

  // Node clicks are only used for the empty placeholder bootstrap action.
  // Node/edge selection for the sidebar is sourced from onSelectionChange.
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
  const suppressNextPaneClickClear = useRef(false);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const reflowRequestId = useRef(0);
  const isReflowingRef = useRef(false);
  const hasAppliedInitialViewportRef = useRef(false);
  const lastUserViewportInteractionAtRef = useRef(0);
  const resizeAnchorFrameRef = useRef<number | null>(null);

  const clearConnectionInteraction = useCallback(() => {
    connectingNodeId.current = null;
    connectingHandleType.current = null;
    connectingHandleId.current = null;
    reconnectingEdgeId.current = null;
  }, []);

  const keepTriggerVisibleInViewport = useCallback(
    (input?: { force?: boolean; duration?: number }) => {
      if (!isLoaded || nodes.length === 0) {
        return;
      }

      if (
        !input?.force &&
        (isReflowingRef.current ||
          isManualViewportCooldownActive({
            now: Date.now(),
            lastInteractionAt: lastUserViewportInteractionAtRef.current,
          }))
      ) {
        return;
      }

      const triggerNode = nodes.find((node) => node.data.type === "trigger");
      if (!triggerNode) {
        return;
      }

      const containerBounds =
        canvasContainerRef.current?.getBoundingClientRect();
      if (!containerBounds) {
        return;
      }

      const nextViewport = computeViewportForTriggerVisibility({
        viewport: getViewport(),
        container: {
          width: containerBounds.width,
          height: containerBounds.height,
        },
        triggerPosition: triggerNode.position,
        triggerSize: {
          width: WORKFLOW_NODE_WIDTH,
          height: WORKFLOW_NODE_HEIGHT,
        },
      });
      if (!nextViewport) {
        return;
      }

      void setViewport(nextViewport, {
        duration: input?.duration ?? 140,
      });
    },
    [getViewport, isLoaded, nodes, setViewport],
  );

  const scheduleResizeAnchor = useCallback(() => {
    if (resizeAnchorFrameRef.current !== null) {
      return;
    }

    resizeAnchorFrameRef.current = window.requestAnimationFrame(() => {
      resizeAnchorFrameRef.current = null;
      keepTriggerVisibleInViewport({ duration: 140 });
    });
  }, [keepTriggerVisibleInViewport]);

  const markUserViewportInteraction = useCallback(
    (event: MouseEvent | TouchEvent | null) => {
      if (event) {
        lastUserViewportInteractionAtRef.current = Date.now();
      }
    },
    [],
  );

  // Animated edges mapping
  const edgesWithTypes = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        data: {
          ...(typeof edge.data === "object" && edge.data ? edge.data : {}),
          executionStatus: executionEdgeStatusByEdgeId[edge.id] ?? "default",
        },
        type: edge.type || "animated",
        animated: true,
        reconnectable: "target" as const,
      })),
    [edges, executionEdgeStatusByEdgeId],
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
        position: { x: position.x - 110, y: position.y - 68 },
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
      const sourceIsTrigger = isTriggerNode(sourceNode);
      const sourceIsClientTrigger = isClientJourneyTriggerNode(sourceNode);
      const clientTriggerEntryLabel = getClientTriggerEntryLabel(sourceNode);

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

        const triggerBranch =
          sourceIsTrigger && connectingHandleType.current === "source"
            ? (normalizeTriggerBranch(sourceHandle) ??
              pickTriggerBranchFromExistingEdges({
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
            sourceHandle: conditionBranch ?? triggerBranch ?? sourceHandle,
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
            ...(triggerBranch
              ? {
                  label: sourceIsClientTrigger
                    ? clientTriggerEntryLabel
                    : triggerBranch === "scheduled"
                      ? "Scheduled"
                      : "Canceled",
                  data: { triggerBranch },
                }
              : {}),
            animated: true,
          },
        ];
      });
      setHasUnsavedChanges(true);
      setPropertiesPanelTab("properties");
      setSelection({ nodeId: newNodeId, edgeId: null });
      suppressNextPaneClickClear.current = true;

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
    if (suppressNextPaneClickClear.current) {
      suppressNextPaneClickClear.current = false;
      return;
    }
    setSelection({ nodeId: null, edgeId: null });
  }, [closeContextMenu, setSelection]);

  const handleSelectionChange = useCallback(
    ({
      nodes: selectedNodes,
      edges: selectedEdges,
    }: {
      nodes: Array<{ id: string }>;
      edges: Array<{ id: string }>;
    }) => {
      if (selectedNodes.length > 0) {
        setSelection({
          nodeId: selectedNodes[0]?.id ?? null,
          edgeId: null,
        });
        return;
      }

      if (selectedEdges.length > 0) {
        setSelection({
          nodeId: null,
          edgeId: selectedEdges[0]?.id ?? null,
        });
        return;
      }

      // Keep externally-driven selection (for example, timeline clicks in
      // run mode). Pane clicks still clear selection via onPaneClick.
    },
    [setSelection],
  );

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

  const handleReflow = useCallback(async () => {
    if (!canEdit || nodes.length === 0 || isReflowingRef.current) {
      return;
    }

    isReflowingRef.current = true;
    setIsReflowing(true);
    const requestId = reflowRequestId.current + 1;
    reflowRequestId.current = requestId;

    try {
      const containerWidth =
        canvasContainerRef.current?.getBoundingClientRect().width ??
        (typeof window !== "undefined" ? window.innerWidth : 1280);
      const { nodes: nextNodes, changed } = await layoutWorkflowNodes({
        nodes,
        edges,
        availableWidth: containerWidth,
      });

      if (requestId !== reflowRequestId.current) {
        return;
      }

      if (changed) {
        setNodes(nextNodes);
        setHasUnsavedChanges(true);
      }

      window.requestAnimationFrame(() => {
        Promise.resolve(
          fitView({
            padding: 0.4,
            duration: 300,
            minZoom: 0.28,
            maxZoom: 0.85,
          }),
        ).then(() => {
          keepTriggerVisibleInViewport({ force: true, duration: 180 });
        });
      });
    } finally {
      if (requestId === reflowRequestId.current) {
        isReflowingRef.current = false;
        setIsReflowing(false);
      }
    }
  }, [
    canEdit,
    edges,
    fitView,
    keepTriggerVisibleInViewport,
    nodes,
    setHasUnsavedChanges,
    setNodes,
  ]);

  useEffect(() => {
    if (
      !isLoaded ||
      nodes.length === 0 ||
      hasAppliedInitialViewportRef.current
    ) {
      return;
    }

    hasAppliedInitialViewportRef.current = true;

    const frameId = window.requestAnimationFrame(() => {
      Promise.resolve(
        fitView({ padding: 0.58, minZoom: 0.28, maxZoom: 0.8, duration: 220 }),
      ).then(() => {
        keepTriggerVisibleInViewport({ force: true, duration: 180 });
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [fitView, isLoaded, keepTriggerVisibleInViewport, nodes.length]);

  useEffect(() => {
    if (!isLoaded || typeof window === "undefined") {
      return;
    }

    const container = canvasContainerRef.current;
    if (!container) {
      return;
    }

    const handleWindowResize = () => {
      scheduleResizeAnchor();
    };
    window.addEventListener("resize", handleWindowResize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        scheduleResizeAnchor();
      });
      observer.observe(container);
    }

    return () => {
      window.removeEventListener("resize", handleWindowResize);
      observer?.disconnect();
      if (resizeAnchorFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeAnchorFrameRef.current);
        resizeAnchorFrameRef.current = null;
      }
    };
  }, [isLoaded, scheduleResizeAnchor]);

  return (
    <div
      ref={canvasContainerRef}
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
        fitViewOptions={{ padding: 0.58, minZoom: 0.28, maxZoom: 0.8 }}
        connectionLineComponent={Connection}
        connectionMode={ConnectionMode.Strict}
        isValidConnection={isValidConnection}
        minZoom={0.25}
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
        onMoveStart={markUserViewportInteraction}
        onMove={markUserViewportInteraction}
        onMoveEnd={markUserViewportInteraction}
        onSelectionChange={handleSelectionChange}
      >
        <Panel position="bottom-left" className="mb-10">
          <Controls
            canReflow={canEdit && nodes.length > 1 && !isReflowing}
            onReflow={canEdit ? () => void handleReflow() : undefined}
          />
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
