// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import { Handle, Position, type HandleProps } from "@xyflow/react";
import type { ReactNode } from "react";

type SourceHandle = {
  id: string;
  style?: HandleProps["style"];
};

type HandleConfig = {
  target: boolean;
  source: boolean;
  sourceHandles?: SourceHandle[];
};

type NodeWrapperProps = {
  handles: HandleConfig;
  selected: boolean;
  className?: string;
  children: ReactNode;
};

export function NodeWrapper({
  handles,
  selected,
  className,
  children,
}: NodeWrapperProps) {
  return (
    <div
      className={`relative flex h-48 w-48 flex-col items-center justify-center rounded-md border bg-card shadow-none transition-all duration-150 ease-out ${
        selected ? "border-primary" : "border-border"
      } ${className ?? ""}`}
    >
      {handles.target ? (
        <Handle type="target" position={Position.Left} />
      ) : null}

      {children}

      {handles.sourceHandles ? (
        handles.sourceHandles.map((h) => (
          <Handle
            key={h.id}
            type="source"
            id={h.id}
            position={Position.Right}
            style={h.style}
          />
        ))
      ) : handles.source ? (
        <Handle type="source" position={Position.Right} />
      ) : null}
    </div>
  );
}
