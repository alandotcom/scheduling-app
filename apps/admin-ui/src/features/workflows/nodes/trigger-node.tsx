import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { Clock01Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import type { EditorNodeData } from "../workflow-editor-types";
import { Node, NodeDescription, NodeTitle } from "../flow-elements/node";
import { cn } from "@/lib/utils";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toEditorNodeData(value: unknown): EditorNodeData {
  if (!isRecord(value)) {
    return {
      type: "trigger",
      label: "Trigger",
      description: "",
      config: {},
      enabled: true,
      status: "idle",
    };
  }

  const config = isRecord(value.config) ? value.config : {};
  return {
    type: value.type === "action" ? "action" : "trigger",
    label: typeof value.label === "string" ? value.label : "Trigger",
    description: typeof value.description === "string" ? value.description : "",
    config,
    enabled: value.enabled !== false,
    status: typeof value.status === "string" ? value.status : "idle",
  };
}

function toNodeStatus(
  value: string,
): "idle" | "running" | "success" | "error" | "cancelled" {
  if (
    value === "running" ||
    value === "success" ||
    value === "error" ||
    value === "cancelled"
  ) {
    return value;
  }

  return "idle";
}

export const TriggerNode = memo(({ data, selected }: NodeProps) => {
  const payload = toEditorNodeData(data);
  const triggerType =
    typeof payload.config.triggerType === "string"
      ? payload.config.triggerType
      : "Webhook";
  const startEvents =
    Array.isArray(payload.config.webhookCreateEvents) &&
    payload.config.webhookCreateEvents.every(
      (entry) => typeof entry === "string",
    )
      ? payload.config.webhookCreateEvents
      : [];
  const triggerSummary =
    triggerType === "Schedule"
      ? "Schedule trigger"
      : (startEvents[0] ?? "Domain event trigger");
  const TriggerIcon = triggerType === "Schedule" ? Clock01Icon : PlayIcon;

  return (
    <Node
      className={cn(
        "flex h-48 w-48 min-w-0 flex-col items-center justify-center shadow-none transition-all duration-150 ease-out",
        selected ? "border-primary ring-2 ring-ring" : undefined,
      )}
      handles={{ target: false, source: true }}
      status={toNodeStatus(payload.status)}
    >
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Icon icon={TriggerIcon} className="size-12 text-blue-500" />
        <div className="flex flex-col items-center gap-1">
          <NodeTitle className="text-base">
            {payload.label || "Trigger"}
          </NodeTitle>
          <NodeDescription className="text-xs">
            {payload.description || triggerSummary}
          </NodeDescription>
        </div>
      </div>
    </Node>
  );
});

TriggerNode.displayName = "TriggerNode";
