import {
  Background,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowProps,
} from "@xyflow/react";
import type { ReactNode } from "react";
import "@xyflow/react/dist/style.css";

type CanvasProps<
  NodeType extends Node = Node,
  EdgeType extends Edge = Edge,
> = ReactFlowProps<NodeType, EdgeType> & {
  children?: ReactNode;
};

export function Canvas<
  NodeType extends Node = Node,
  EdgeType extends Edge = Edge,
>({ children, ...props }: CanvasProps<NodeType, EdgeType>) {
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
      <Background
        bgColor="var(--background)"
        color="var(--border)"
        gap={24}
        size={2}
      />
      {children}
    </ReactFlow>
  );
}
