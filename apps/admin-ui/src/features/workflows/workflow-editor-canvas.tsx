import {
  ConnectionMode,
  type IsValidConnection,
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
  onWorkflowEditorConnectAtom,
  onWorkflowEditorEdgesChangeAtom,
  onWorkflowEditorNodesChangeAtom,
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
  const setSelection = useSetAtom(setWorkflowEditorSelectionAtom);
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
    (_event: React.MouseEvent, node: WorkflowCanvasNode) => {
      if (node.id === "__empty-placeholder__") {
        addInitialTrigger();
      }
    },
    [addInitialTrigger],
  );

  // Connection-to-create-node refs
  const connectingNodeId = useRef<string | null>(null);
  const connectingHandleType = useRef<"source" | "target" | null>(null);

  // Animated edges mapping
  const edgesWithTypes = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        type: edge.type || "animated",
        animated: true,
      })),
    [edges],
  );

  const handleConnectStart = useCallback(
    (
      _event: MouseEvent | TouchEvent,
      params: { nodeId: string | null; handleType: "source" | "target" | null },
    ) => {
      connectingNodeId.current = params.nodeId;
      connectingHandleType.current = params.handleType;
    },
    [],
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

      if (!isDroppedOnCanvas) {
        connectingNodeId.current = null;
        connectingHandleType.current = null;
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

      setNodes((currentNodes) => [...currentNodes, newNode]);
      setEdges((currentEdges) => [
        ...currentEdges,
        {
          id: edgeId,
          source:
            connectingHandleType.current === "source" ? sourceId : newNodeId,
          target:
            connectingHandleType.current === "source" ? newNodeId : sourceId,
          animated: true,
        },
      ]);
      setHasUnsavedChanges(true);
      setSelection({ nodeId: newNodeId, edgeId: null });

      connectingNodeId.current = null;
      connectingHandleType.current = null;
    },
    [
      canEdit,
      screenToFlowPosition,
      setNodes,
      setEdges,
      setHasUnsavedChanges,
      setSelection,
    ],
  );

  const handlePaneClick = useCallback(() => {
    closeContextMenu();
    setSelection({ nodeId: null, edgeId: null });
  }, [closeContextMenu, setSelection]);

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
        onConnect={canEdit ? (connection) => onConnect(connection) : undefined}
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
