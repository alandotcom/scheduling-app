import { Handle, Position } from "@xyflow/react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type NodeProps = ComponentProps<"div"> & {
  handles: {
    target: boolean;
    source: boolean;
  };
  status?: "idle" | "running" | "success" | "error" | "cancelled";
};

export function Node({ handles, className, status, ...props }: NodeProps) {
  return (
    <div
      className={cn(
        "node-container relative flex h-auto w-48 flex-col rounded-md border border-border bg-card p-0 transition-all duration-200",
        status === "success" && "border-2 border-green-500",
        status === "error" && "border-2 border-red-500",
        status === "cancelled" && "border-2 border-slate-500",
        className,
      )}
      {...props}
    >
      {handles.target ? (
        <Handle position={Position.Left} type="target" />
      ) : null}
      {handles.source ? (
        <Handle position={Position.Right} type="source" />
      ) : null}
      {props.children}
    </div>
  );
}

type NodeTitleProps = ComponentProps<"div">;
type NodeDescriptionProps = ComponentProps<"div">;

export function NodeTitle({ className, ...props }: NodeTitleProps) {
  return (
    <div
      className={cn(
        "text-base leading-tight font-semibold tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

export function NodeDescription({ className, ...props }: NodeDescriptionProps) {
  return (
    <div
      className={cn("text-muted-foreground text-xs leading-tight", className)}
      {...props}
    />
  );
}
