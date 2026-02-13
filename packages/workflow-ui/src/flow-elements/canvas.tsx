// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import { Background, ReactFlow, type ReactFlowProps } from "@xyflow/react";
import type { BuilderNode } from "../utils";

type CanvasProps = ReactFlowProps<BuilderNode> & {
  children?: React.ReactNode;
};

export function Canvas({ children, ...props }: CanvasProps) {
  return (
    <ReactFlow<BuilderNode>
      deleteKeyCode={["Backspace", "Delete"]}
      fitView
      panActivationKeyCode={null}
      selectionOnDrag={false}
      zoomOnDoubleClick={false}
      zoomOnPinch
      className="h-full w-full"
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
