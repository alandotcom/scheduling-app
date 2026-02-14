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
      type: "action",
      label: "Action",
      description: "",
      config: {},
      enabled: true,
      status: "idle",
    };
  }

  const config = isRecord(value.config) ? value.config : {};
  return {
    type: value.type === "trigger" ? "trigger" : "action",
    label: typeof value.label === "string" ? value.label : "Action",
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

export const ActionNode = memo(({ data, selected }: NodeProps) => {
  const payload = toEditorNodeData(data);
  const actionType =
    typeof payload.config.actionType === "string"
      ? payload.config.actionType
      : typeof payload.config.actionId === "string"
        ? payload.config.actionId
        : "Action";

  return (
    <Node
      className={selected ? "ring-2 ring-ring" : undefined}
      handles={{ target: true, source: true }}
      status={toNodeStatus(payload.status)}
    >
      <NodeHeader>
        <NodeTitle className="text-sm">{payload.label || actionType}</NodeTitle>
        <NodeDescription>{payload.description || actionType}</NodeDescription>
      </NodeHeader>
      <NodeContent className="text-xs text-muted-foreground">
        Type: {actionType}
      </NodeContent>
    </Node>
  );
});

ActionNode.displayName = "ActionNode";
