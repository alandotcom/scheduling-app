import { Panel as ReactFlowPanel, type PanelProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: PanelProps) {
  return (
    <ReactFlowPanel
      className={cn("m-4 rounded-md border bg-card p-1 shadow-sm", className)}
      {...props}
    />
  );
}
