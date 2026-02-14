import type { RunWorkflowDraftInput } from "@scheduling/dto";
import type { Edge, Node } from "@xyflow/react";

export type WorkflowBranch = "next" | "timeout" | "true" | "false";

export type EditorNodeData = {
  type: "trigger" | "action";
  label: string;
  description: string;
  config: Record<string, unknown>;
  enabled: boolean;
  status: string;
};

export type EditorNode = Node<EditorNodeData>;
export type EditorEdge = Edge<{ branch?: WorkflowBranch }>;

export type RunEntityType = RunWorkflowDraftInput["entityType"];

export const RUN_ENTITY_TYPES: RunEntityType[] = [
  "appointment",
  "calendar",
  "appointment_type",
  "resource",
  "location",
  "client",
  "workflow",
];
