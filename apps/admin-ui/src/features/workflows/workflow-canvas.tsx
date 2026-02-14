import { useMemo, useState } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { EditorEdge, EditorNode } from "./workflow-editor-types";
import { ActionNode } from "./nodes/action-node";
import { TriggerNode } from "./nodes/trigger-node";
import { AddNode } from "./nodes/add-node";
import { Canvas } from "./flow-elements/canvas";
import { Connection as ConnectionLine } from "./flow-elements/connection";
import { Controls } from "./flow-elements/controls";
import { Edge as WorkflowEdge } from "./flow-elements/edge";
import { Panel } from "./flow-elements/panel";
import {
  type ContextMenuState,
  useContextMenuHandlers,
  WorkflowContextMenu,
} from "./workflow-context-menu";

type WorkflowCanvasProps = {
  nodes: EditorNode[];
  edges: EditorEdge[];
  onNodesChange: (nodes: EditorNode[]) => void;
  onEdgesChange: (edges: EditorEdge[]) => void;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onAddActionAt: (position: { x: number; y: number }) => void;
};

function WorkflowCanvasInner({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onAddActionAt,
}: WorkflowCanvasProps) {
  const [menuState, setMenuState] = useState<ContextMenuState>(null);
  const { screenToFlowPosition } = useReactFlow();

  const nodeTypes = useMemo(
    () => ({
      trigger: TriggerNode,
      action: ActionNode,
      add: AddNode,
    }),
    [],
  );

  const edgeTypes = useMemo(
    () => ({
      animated: WorkflowEdge.Animated,
      temporary: WorkflowEdge.Temporary,
    }),
    [],
  );

  const { onNodeContextMenu, onEdgeContextMenu, onPaneContextMenu } =
    useContextMenuHandlers(screenToFlowPosition, setMenuState);

  return (
    <div className="h-full w-full">
      <Canvas
        connectionLineComponent={ConnectionLine}
        edgeTypes={edgeTypes}
        edges={edges}
        isValidConnection={(connection: Edge | Connection) => {
          if (!connection.source || !connection.target) {
            return false;
          }
          if (connection.source === connection.target) {
            return false;
          }
          const targetNode = nodes.find(
            (node) => node.id === connection.target,
          );
          return targetNode?.data.type !== "trigger";
        }}
        nodeTypes={nodeTypes}
        nodes={nodes.map((node) => ({
          ...node,
          selected: selectedNodeId === node.id,
        }))}
        onConnect={(connection) => {
          if (!connection.source || !connection.target) {
            return;
          }
          onEdgesChange(
            addEdge(
              {
                ...connection,
                id: `edge_${nanoid()}`,
                type: "animated",
              },
              edges,
            ),
          );
        }}
        onEdgeClick={(_, edge) => {
          onSelectEdge(edge.id);
          onSelectNode(null);
        }}
        onEdgeContextMenu={onEdgeContextMenu}
        onEdgesChange={(changes: EdgeChange<EditorEdge>[]) => {
          onEdgesChange(applyEdgeChanges(changes, edges));
        }}
        onNodeClick={(_, node) => {
          onSelectNode(node.id);
          onSelectEdge(null);
        }}
        onNodeContextMenu={onNodeContextMenu}
        onNodesChange={(changes: NodeChange<EditorNode>[]) => {
          const filteredChanges = changes.filter((change) => {
            if (change.type !== "remove") {
              return true;
            }
            const target = nodes.find((node) => node.id === change.id);
            return target?.data.type !== "trigger";
          });
          onNodesChange(applyNodeChanges(filteredChanges, nodes));
        }}
        onPaneClick={() => {
          onSelectNode(null);
          onSelectEdge(null);
        }}
        onPaneContextMenu={onPaneContextMenu}
      >
        <Panel className="p-2" position="top-left">
          <Button
            onClick={() => {
              onAddActionAt(
                screenToFlowPosition({
                  x: window.innerWidth / 2,
                  y: window.innerHeight / 2,
                }),
              );
            }}
            size="sm"
            variant="secondary"
          >
            <Icon icon={Add01Icon} className="size-4" />
            Add step
          </Button>
        </Panel>
        <Panel position="bottom-left">
          <Controls />
        </Panel>
      </Canvas>

      <WorkflowContextMenu
        isTriggerNode={(nodeId) =>
          nodes.find((node) => node.id === nodeId)?.data.type === "trigger"
        }
        menuState={menuState}
        onAddStep={(position) => onAddActionAt(position)}
        onClose={() => setMenuState(null)}
        onDeleteEdge={(edgeId) => {
          onEdgesChange(edges.filter((edge) => edge.id !== edgeId));
          if (selectedEdgeId === edgeId) {
            onSelectEdge(null);
          }
        }}
        onDeleteNode={(nodeId) => {
          onNodesChange(nodes.filter((node) => node.id !== nodeId));
          onEdgesChange(
            edges.filter(
              (edge) => edge.source !== nodeId && edge.target !== nodeId,
            ),
          );
          if (selectedNodeId === nodeId) {
            onSelectNode(null);
          }
        }}
      />
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
