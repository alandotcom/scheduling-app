import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { EditorNodeData } from "../workflow-editor-types";
import {
  Node,
  NodeContent,
  NodeDescription,
  NodeHeader,
  NodeTitle,
} from "../flow-elements/node";

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

  return (
    <Node
      className={selected ? "ring-2 ring-ring" : undefined}
      handles={{ target: false, source: true }}
      status={toNodeStatus(payload.status)}
    >
      <NodeHeader>
        <NodeTitle className="text-sm">
          {payload.label || triggerType}
        </NodeTitle>
        <NodeDescription>{payload.description || "Trigger"}</NodeDescription>
      </NodeHeader>
      <NodeContent className="text-xs text-muted-foreground">
        Type: {triggerType}
      </NodeContent>
    </Node>
  );
});

TriggerNode.displayName = "TriggerNode";
