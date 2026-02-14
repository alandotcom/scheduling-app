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
      fitViewOptions={{ maxZoom: 1, minZoom: 0.5, padding: 0.2, duration: 0 }}
      minZoom={0.35}
      maxZoom={1.5}
      panActivationKeyCode={null}
      selectionOnDrag={false}
      zoomOnDoubleClick={false}
      zoomOnPinch
      {...props}
    >
      <Background
        bgColor="var(--sidebar)"
        color="var(--border)"
        gap={24}
        size={2}
      />
      {children}
    </ReactFlow>
  );
}
