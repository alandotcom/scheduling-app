import type { NodeProps } from "@xyflow/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  BlockedIcon,
  CancelCircleIcon,
  FlashIcon,
  GitBranchIcon,
  HourglassIcon,
  Tick02Icon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { memo } from "react";
import {
  Node,
  NodeDescription,
  NodeTitle,
} from "@/components/flow-elements/node";
import { cn } from "@/lib/utils";
import { getAction } from "../action-registry";

type ActionNodeData = {
  label?: string;
  description?: string;
  status?: "idle" | "running" | "success" | "error" | "cancelled";
  enabled?: boolean;
  config?: {
    actionType?: string;
  };
};

function getActionIconAndColor(actionType?: string): {
  icon: IconSvgElement;
  colorClass: string;
  bgClass: string;
} {
  switch (actionType) {
    case "http-request":
      return {
        icon: FlashIcon,
        colorClass: "text-amber-500",
        bgClass: "bg-amber-500/10",
      };
    case "condition":
      return {
        icon: GitBranchIcon,
        colorClass: "text-pink-500",
        bgClass: "bg-pink-500/10",
      };
    case "wait":
      return {
        icon: HourglassIcon,
        colorClass: "text-orange-500",
        bgClass: "bg-orange-500/10",
      };
    default:
      return {
        icon: FlashIcon,
        colorClass: "text-muted-foreground",
        bgClass: "bg-muted",
      };
  }
}

function StatusBadge({ status }: { status: ActionNodeData["status"] }) {
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

const ActionNode = memo(function ActionNode({ data, selected }: NodeProps) {
  const nodeData = data as ActionNodeData;
  const isDisabled = nodeData.enabled === false;
  const actionType = nodeData.config?.actionType;
  const actionDef = actionType ? getAction(actionType) : undefined;
  const { icon, colorClass, bgClass } = getActionIconAndColor(actionType);
  const title = nodeData.label || actionDef?.label || "Action";
  const description =
    nodeData.description || actionDef?.description || "Select an action";
  const status = nodeData.status;

  return (
    <Node
      handles={{ target: true, source: true }}
      status={status}
      className={cn(
        "h-48 w-48 flex-col items-center justify-center shadow-none",
        selected && "border-primary",
        isDisabled && "opacity-50",
      )}
    >
      {isDisabled && (
        <div className="absolute top-2 left-2 flex size-5 items-center justify-center rounded-full bg-muted">
          <Icon icon={ViewOffIcon} className="size-3 text-muted-foreground" />
        </div>
      )}
      <StatusBadge status={status} />
      <div className="flex flex-col items-center gap-2 p-4 text-center">
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-lg",
            bgClass,
          )}
        >
          <Icon icon={icon} className={cn("size-6", colorClass)} />
        </div>
        <NodeTitle className="text-base font-medium">{title}</NodeTitle>
        <NodeDescription className="text-xs">{description}</NodeDescription>
      </div>
    </Node>
  );
});

ActionNode.displayName = "ActionNode";

export { ActionNode };
