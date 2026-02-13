// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import { useCallback, useMemo, type ReactNode } from "react";
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
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  Clock01Icon,
  GitBranchIcon,
  StopCircleIcon,
  Add01Icon,
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

type WorkflowCanvasProps = {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  readOnly: boolean;
  onNodesChange: (nodes: BuilderNode[]) => void;
  onEdgesChange: (edges: BuilderEdge[]) => void;
  onSelectionChange: (nodeId: string | null) => void;
  onInit: (instance: ReactFlowInstance<BuilderNode>) => void;
  onAddAction: () => void;
  onAddWait: () => void;
  onAddCondition: () => void;
  onAddTerminal: () => void;
  hasActions: boolean;
  emptyState?: ReactNode;
};

function isValidConnection(connection: Edge | Connection): boolean {
  if (!connection.source || !connection.target) return false;
  if (connection.source === connection.target) return false;
  if (connection.target === TRIGGER_NODE_ID) return false;
  return true;
}

export function WorkflowCanvas({
  nodes,
  edges,
  readOnly,
  onNodesChange,
  onEdgesChange,
  onSelectionChange,
  onInit,
  onAddAction,
  onAddWait,
  onAddCondition,
  onAddTerminal,
  hasActions,
  emptyState,
}: WorkflowCanvasProps) {
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
    },
    [edges, onEdgesChange],
  );

  const editableFlowHandlers = readOnly
    ? {}
    : {
        onNodesChange: handleNodesChange,
        onEdgesChange: handleEdgesChange,
        onConnect: handleConnect,
      };

  return (
    <div className="relative h-full w-full">
      <Canvas
        nodes={nodes}
        edges={renderedEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        connectionLineComponent={ConnectionLine}
        connectionMode={ConnectionMode.Strict}
        isValidConnection={isValidConnection}
        onInit={onInit}
        defaultEdgeOptions={{
          type: "animated",
        }}
        onSelectionChange={(selection) => {
          const selected = selection.nodes[0];
          onSelectionChange(selected?.id ?? null);
        }}
        {...editableFlowHandlers}
      >
        <Controls />
        {!readOnly ? (
          <Panel position="top-left">
            <div className="flex [&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none">
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-md border bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80"
                onClick={onAddAction}
                disabled={!hasActions}
                title="Add Action"
              >
                <HugeiconsIcon
                  icon={Add01Icon}
                  className="size-4"
                  strokeWidth={2}
                />
              </button>
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-md border bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80"
                onClick={onAddWait}
                title="Add Wait"
              >
                <HugeiconsIcon
                  icon={Clock01Icon}
                  className="size-4"
                  strokeWidth={2}
                />
              </button>
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-md border bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80"
                onClick={onAddCondition}
                title="Add Condition"
              >
                <HugeiconsIcon
                  icon={GitBranchIcon}
                  className="size-4"
                  strokeWidth={2}
                />
              </button>
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-md border bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80"
                onClick={onAddTerminal}
                title="Add Terminal"
              >
                <HugeiconsIcon
                  icon={StopCircleIcon}
                  className="size-4"
                  strokeWidth={2}
                />
              </button>
            </div>
          </Panel>
        ) : null}
      </Canvas>

      {emptyState}
    </div>
  );
}
