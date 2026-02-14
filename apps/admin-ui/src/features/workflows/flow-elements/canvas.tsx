import { Background, ReactFlow, type ReactFlowProps } from "@xyflow/react";
import type { ReactNode } from "react";
import type { EditorEdge, EditorNode } from "../workflow-editor-types";

export type WorkflowCanvasRootProps = ReactFlowProps<EditorNode, EditorEdge> & {
  children?: ReactNode;
};

export function Canvas({ children, ...props }: WorkflowCanvasRootProps) {
  return (
    <ReactFlow
      deleteKeyCode={["Backspace", "Delete"]}
      fitView
      panActivationKeyCode={null}
      selectionOnDrag={false}
      zoomOnDoubleClick={false}
      zoomOnPinch
      {...props}
    >
      <Background gap={24} size={1.5} />
      {children}
    </ReactFlow>
  );
}
