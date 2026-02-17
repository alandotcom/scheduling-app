import type { Node as ReactFlowNode, NodeProps } from "@xyflow/react";
import {
  BlockedIcon,
  CancelCircleIcon,
  PlayIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { useAtomValue } from "jotai";
import { Icon } from "@/components/ui/icon";
import { memo } from "react";
import {
  Node,
  NodeDescription,
  NodeTitle,
} from "@/components/flow-elements/node";
import { cn } from "@/lib/utils";
import {
  selectedExecutionIdAtom,
  type WorkflowTriggerNodeData,
  workflowExecutionLogsByNodeIdAtom,
  type WorkflowExecutionNodeLogPreview,
} from "../workflow-editor-store";

type TriggerFlowNode = ReactFlowNode<WorkflowTriggerNodeData, "trigger">;
type TriggerNodeProps = NodeProps<TriggerFlowNode>;

function toRuntimeNodeStatus(
  status: WorkflowExecutionNodeLogPreview["status"] | undefined,
): WorkflowTriggerNodeData["status"] {
  if (!status || status === "pending") {
    return "idle";
  }

  return status;
}

function StatusBadge({
  status,
}: {
  status: WorkflowTriggerNodeData["status"];
}) {
  if (!status || status === "idle" || status === "running") return null;

  return (
    <div
      className={cn(
        "absolute top-2 right-2 flex size-5 items-center justify-center rounded-full",
        status === "success" && "bg-green-500/50",
        status === "error" && "bg-red-500/50",
        status === "cancelled" && "bg-slate-500/50",
      )}
    >
      <Icon
        icon={
          status === "success"
            ? Tick02Icon
            : status === "error"
              ? CancelCircleIcon
              : BlockedIcon
        }
        className="size-3 text-white"
      />
    </div>
  );
}

const TriggerNode = memo(function TriggerNode({
  id,
  data: nodeData,
  selected,
}: TriggerNodeProps) {
  const selectedExecutionId = useAtomValue(selectedExecutionIdAtom);
  const executionLogsByNodeId = useAtomValue(workflowExecutionLogsByNodeIdAtom);
  const title = nodeData.label || "Trigger";
  const description = nodeData.description || "Trigger";
  const runtimeStatus =
    selectedExecutionId !== null
      ? toRuntimeNodeStatus(executionLogsByNodeId[id]?.status)
      : undefined;
  const status = runtimeStatus ?? nodeData.status;

  return (
    <Node
      handles={{ target: false, source: true }}
      status={status}
      className={cn(
        "h-48 w-48 flex-col items-center justify-center shadow-none",
        selected && "border-primary",
      )}
    >
      <StatusBadge status={status} />
      <div className="flex flex-col items-center gap-2 p-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
          <Icon icon={PlayIcon} className="size-6 text-primary" />
        </div>
        <NodeTitle className="text-base font-medium">{title}</NodeTitle>
        <NodeDescription className="text-xs">{description}</NodeDescription>
      </div>
    </Node>
  );
});

TriggerNode.displayName = "TriggerNode";

export { TriggerNode };
