// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  addEdge,
  ConnectionMode,
  Controls,
  Panel,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
  type OnConnectStartParams,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  Add01Icon,
  Clock01Icon,
  GitBranchIcon,
  StopCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Canvas } from "./flow-elements/canvas";
import { AnimatedEdge, TemporaryEdge } from "./flow-elements/edge";
import { ConnectionLine } from "./flow-elements/connection-line";
import { TriggerNode } from "./nodes/trigger-node";
import { ActionNode } from "./nodes/action-node";
import { WaitNode } from "./nodes/wait-node";
import { ConditionNode } from "./nodes/condition-node";
import { TerminalNode } from "./nodes/terminal-node";
import {
  createNodeId,
  TRIGGER_NODE_ID,
  TRIGGER_EDGE_PREFIX,
  type BuilderNode,
  type BuilderEdge,
} from "./utils";

const NODE_TYPES: NodeTypes = {
  triggerNode: TriggerNode,
  actionNode: ActionNode,
  waitNode: WaitNode,
  conditionNode: ConditionNode,
  terminalNode: TerminalNode,
};

const EDGE_TYPES: EdgeTypes = {
  animated: AnimatedEdge,
  temporary: TemporaryEdge,
};

type WorkflowNodeCreationKind = "action" | "wait" | "condition" | "terminal";

type WorkflowCanvasProps = {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  readOnly: boolean;
  selectedNodeId: string | null;
  onNodesChange: (nodes: BuilderNode[]) => void;
  onEdgesChange: (edges: BuilderEdge[]) => void;
  onSelectionChange: (nodeId: string | null) => void;
  onInit: (instance: ReactFlowInstance<BuilderNode>) => void;
  onCreateNode: (request: {
    kind: WorkflowNodeCreationKind;
    sourceNodeId?: string | null | undefined;
    sourceHandleId?: string | null | undefined;
    position?: { x: number; y: number };
  }) => void;
  hasActions: boolean;
  emptyState?: ReactNode;
};

type CommandMenuState = {
  left: number;
  top: number;
  flowPosition: { x: number; y: number };
  sourceNodeId?: string | null | undefined;
  sourceHandleId?: string | null | undefined;
};

function isValidConnection(connection: Edge | Connection): boolean {
  if (!connection.source || !connection.target) return false;
  if (connection.source === connection.target) return false;
  if (connection.target === TRIGGER_NODE_ID) return false;
  return true;
}

function getClientPosition(event: MouseEvent | TouchEvent): {
  x: number;
  y: number;
} {
  if ("changedTouches" in event) {
    const touch = event.changedTouches[0];
    return {
      x: touch?.clientX ?? 0,
      y: touch?.clientY ?? 0,
    };
  }

  return { x: event.clientX, y: event.clientY };
}

export function WorkflowCanvas({
  nodes,
  edges,
  readOnly,
  selectedNodeId,
  onNodesChange,
  onEdgesChange,
  onSelectionChange,
  onInit,
  onCreateNode,
  hasActions,
  emptyState,
}: WorkflowCanvasProps) {
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance<BuilderNode> | null>(null);
  const [commandMenu, setCommandMenu] = useState<CommandMenuState | null>(null);
  const connectContextRef = useRef<{
    sourceNodeId: string | null;
    sourceHandleId: string | null;
  } | null>(null);

  const triggerEdges = useMemo(() => {
    const incomingTargets = new Set(edges.map((e) => e.target));
    const rootNodes = nodes.filter(
      (node) =>
        node.data.graphNode.kind !== "trigger" && !incomingTargets.has(node.id),
    );
    return rootNodes.map((node) => ({
      id: `${TRIGGER_EDGE_PREFIX}${node.id}`,
      source: TRIGGER_NODE_ID,
      target: node.id,
      type: "temporary",
      selectable: false,
      focusable: false,
      deletable: false,
      reconnectable: false,
    }));
  }, [edges, nodes]);

  const renderedEdges = useMemo(
    () => [...edges, ...triggerEdges],
    [edges, triggerEdges],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<BuilderNode>[]) => {
      const nextNodes = applyNodeChanges(changes, nodes);
      onNodesChange(nextNodes);
    },
    [nodes, onNodesChange],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<BuilderEdge>[]) => {
      const nextEdges = applyEdgeChanges(changes, edges);
      onEdgesChange(nextEdges);
    },
    [edges, onEdgesChange],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (
        !connection.source ||
        !connection.target ||
        connection.target === TRIGGER_NODE_ID
      ) {
        return;
      }

      const sourceHandleId = connection.sourceHandle;
      const edgeData: Record<string, unknown> = {};
      if (sourceHandleId === "true" || sourceHandleId === "false") {
        edgeData["branch"] = sourceHandleId;
      }

      const nextEdges = addEdge(
        {
          ...connection,
          id: createNodeId("edge"),
          type: "animated",
          data: edgeData,
        },
        edges,
      );
      onEdgesChange(nextEdges);
      setCommandMenu(null);
    },
    [edges, onEdgesChange],
  );

  const openCommandMenu = useCallback(
    (input: {
      left: number;
      top: number;
      flowPosition: { x: number; y: number };
      sourceNodeId?: string | null | undefined;
      sourceHandleId?: string | null | undefined;
    }) => {
      setCommandMenu({
        left: input.left,
        top: input.top,
        flowPosition: input.flowPosition,
        sourceNodeId: input.sourceNodeId,
        sourceHandleId: input.sourceHandleId,
      });
    },
    [],
  );

  const openCenteredCommandMenu = useCallback(() => {
    if (!reactFlowInstance) return;

    const pane = globalThis.document?.querySelector(".react-flow__pane");
    if (!pane) return;

    const rect = pane.getBoundingClientRect();
    const left = rect.left + rect.width * 0.45;
    const top = rect.top + rect.height * 0.4;
    const flowPosition = reactFlowInstance.screenToFlowPosition({
      x: left,
      y: top,
    });

    openCommandMenu({
      left,
      top,
      flowPosition,
      sourceNodeId: selectedNodeId,
    });
  }, [openCommandMenu, reactFlowInstance, selectedNodeId]);

  const handleCreateNode = useCallback(
    (kind: WorkflowNodeCreationKind) => {
      if (!commandMenu) return;
      onCreateNode({
        kind,
        sourceNodeId: commandMenu.sourceNodeId,
        sourceHandleId: commandMenu.sourceHandleId,
        position: commandMenu.flowPosition,
      });
      setCommandMenu(null);
    },
    [commandMenu, onCreateNode],
  );

  const editableFlowHandlers = readOnly
    ? {}
    : {
        onNodesChange: handleNodesChange,
        onEdgesChange: handleEdgesChange,
        onConnect: handleConnect,
      };

  return (
    <div
      className="relative h-full w-full"
      onContextMenu={(e) => e.preventDefault()}
    >
      <Canvas
        nodes={nodes}
        edges={renderedEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        connectionLineComponent={ConnectionLine}
        connectionMode={ConnectionMode.Strict}
        isValidConnection={isValidConnection}
        onInit={(instance) => {
          setReactFlowInstance(instance);
          onInit(instance);
        }}
        defaultEdgeOptions={{
          type: "animated",
        }}
        onSelectionChange={(selection) => {
          const selected = selection.nodes[0];
          onSelectionChange(selected?.id ?? null);
        }}
        onPaneClick={() => setCommandMenu(null)}
        onPaneContextMenu={(event) => {
          if (readOnly || !reactFlowInstance) return;
          const flowPosition = reactFlowInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          openCommandMenu({
            left: event.clientX,
            top: event.clientY,
            flowPosition,
            sourceNodeId: selectedNodeId,
          });
        }}
        onConnectStart={(_event, params: OnConnectStartParams) => {
          connectContextRef.current = {
            sourceNodeId: params.nodeId,
            sourceHandleId: params.handleId ?? null,
          };
        }}
        onConnectEnd={(event) => {
          if (readOnly || !reactFlowInstance) {
            connectContextRef.current = null;
            return;
          }

          const target = event.target as HTMLElement | null;
          const droppedOnPane =
            target?.classList.contains("react-flow__pane") ??
            Boolean(target?.closest(".react-flow__pane"));

          const sourceContext = connectContextRef.current;
          connectContextRef.current = null;

          if (!droppedOnPane || !sourceContext?.sourceNodeId) return;

          const { x, y } = getClientPosition(event);
          const flowPosition = reactFlowInstance.screenToFlowPosition({ x, y });
          openCommandMenu({
            left: x,
            top: y,
            flowPosition,
            sourceNodeId: sourceContext.sourceNodeId,
            sourceHandleId: sourceContext.sourceHandleId,
          });
        }}
        {...editableFlowHandlers}
      >
        <Controls />
        {!readOnly ? (
          <Panel position="top-left">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-secondary px-2.5 text-xs font-medium text-secondary-foreground shadow-sm hover:bg-secondary/80"
              onClick={openCenteredCommandMenu}
            >
              <HugeiconsIcon
                icon={Add01Icon}
                className="size-3.5"
                strokeWidth={2}
              />
              Add Step
            </button>
          </Panel>
        ) : null}
      </Canvas>

      {commandMenu ? (
        <div
          className="absolute z-30 w-44 rounded-lg border border-border bg-background p-1 shadow-xl"
          style={{ left: commandMenu.left, top: commandMenu.top }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
            onClick={() => handleCreateNode("action")}
            disabled={!hasActions}
          >
            <HugeiconsIcon
              icon={Add01Icon}
              className="size-3.5"
              strokeWidth={2}
            />
            Action
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
            onClick={() => handleCreateNode("wait")}
          >
            <HugeiconsIcon
              icon={Clock01Icon}
              className="size-3.5"
              strokeWidth={2}
            />
            Wait
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
            onClick={() => handleCreateNode("condition")}
          >
            <HugeiconsIcon
              icon={GitBranchIcon}
              className="size-3.5"
              strokeWidth={2}
            />
            Condition
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
            onClick={() => handleCreateNode("terminal")}
          >
            <HugeiconsIcon
              icon={StopCircleIcon}
              className="size-3.5"
              strokeWidth={2}
            />
            Terminal
          </button>
        </div>
      ) : null}

      {emptyState}
    </div>
  );
}
