import { Background, Controls, MiniMap, ReactFlow } from "@xyflow/react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  onWorkflowEditorConnectAtom,
  onWorkflowEditorEdgesChangeAtom,
  onWorkflowEditorNodesChangeAtom,
  workflowEditorEdgesAtom,
  workflowEditorNodesAtom,
} from "./workflow-editor-store";

interface WorkflowEditorCanvasProps {
  canEdit: boolean;
}

export function WorkflowEditorCanvas({ canEdit }: WorkflowEditorCanvasProps) {
  const nodes = useAtomValue(workflowEditorNodesAtom);
  const edges = useAtomValue(workflowEditorEdgesAtom);
  const onNodesChange = useSetAtom(onWorkflowEditorNodesChangeAtom);
  const onEdgesChange = useSetAtom(onWorkflowEditorEdgesChangeAtom);
  const onConnect = useSetAtom(onWorkflowEditorConnectAtom);

  return (
    <div className="h-[68vh] w-full overflow-hidden rounded-xl border border-border bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        minZoom={0.35}
        maxZoom={1.8}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        elementsSelectable={true}
        deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
        onNodesChange={
          canEdit
            ? (changes) => {
                onNodesChange(changes);
              }
            : undefined
        }
        onEdgesChange={
          canEdit
            ? (changes) => {
                onEdgesChange(changes);
              }
            : undefined
        }
        onConnect={
          canEdit
            ? (connection) => {
                onConnect(connection);
              }
            : undefined
        }
      >
        <Background gap={20} size={1} />
        <MiniMap />
        <Controls />
      </ReactFlow>
    </div>
  );
}
