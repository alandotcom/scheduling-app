import type { WorkflowRunStatus, WorkflowStepLogStatus } from "@scheduling/dto";
import { nanoid } from "nanoid";
import {
  mapCanonicalRunStatusToReferenceRunStatus,
  type ReferenceWorkflowEdge,
  type ReferenceWorkflowGraph,
  type ReferenceWorkflowNode,
} from "@/lib/workflows/reference-adapter";
import type {
  EditorEdge,
  EditorNode,
  RunEntityType,
  WorkflowBranch,
} from "./workflow-editor-types";
import { RUN_ENTITY_TYPES } from "./workflow-editor-types";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isWorkflowBranch(value: unknown): value is WorkflowBranch {
  return (
    value === "next" ||
    value === "timeout" ||
    value === "true" ||
    value === "false"
  );
}

export function isRunEntityType(value: string): value is RunEntityType {
  return RUN_ENTITY_TYPES.some((entityType) => entityType === value);
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function formatDateTime(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value instanceof Date ? value.toISOString() : value;
  }

  return parsed.toLocaleString();
}

export function formatDuration(durationMs: number | null): string {
  if (typeof durationMs !== "number") {
    return "n/a";
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(2)}s`;
}

export function toRunStatusBadgeVariant(
  status: WorkflowRunStatus,
): "default" | "secondary" | "success" | "warning" | "destructive" {
  const normalized = mapCanonicalRunStatusToReferenceRunStatus(status);

  switch (normalized) {
    case "running":
      return "default";
    case "success":
      return "success";
    case "cancelled":
      return "secondary";
    case "pending":
    case "waiting":
      return "warning";
    case "error":
    default:
      return "destructive";
  }
}

export function toStepStatusBadgeVariant(
  status: WorkflowStepLogStatus,
): "default" | "secondary" | "success" | "warning" | "destructive" {
  switch (status) {
    case "running":
      return "default";
    case "success":
      return "success";
    case "pending":
      return "warning";
    case "skipped":
      return "secondary";
    case "error":
    default:
      return "destructive";
  }
}

function toEditorNode(node: ReferenceWorkflowNode, index: number): EditorNode {
  const nodeData = isRecord(node.data) ? node.data : {};
  const rawConfig = nodeData["config"];
  const config = isRecord(rawConfig) ? rawConfig : {};
  const isTriggerNode =
    node.type === "trigger" || nodeData["type"] === "trigger";
  const actionType =
    typeof config["actionType"] === "string" ? config["actionType"] : "Action";

  const label =
    typeof nodeData["label"] === "string" && nodeData["label"].trim().length > 0
      ? nodeData["label"]
      : isTriggerNode
        ? "Trigger"
        : actionType;

  return {
    id: node.id,
    type: isTriggerNode ? "trigger" : "action",
    position: node.position ?? { x: index * 240, y: 120 },
    data: {
      type: isTriggerNode ? "trigger" : "action",
      label,
      description:
        typeof nodeData["description"] === "string"
          ? nodeData["description"]
          : "",
      config,
      enabled: nodeData["enabled"] !== false,
      status:
        typeof nodeData["status"] === "string" ? nodeData["status"] : "idle",
    },
    draggable: true,
    selectable: true,
    connectable: true,
  };
}

function toEditorEdge(edge: ReferenceWorkflowEdge): EditorEdge {
  const branch = isRecord(edge.data) ? edge.data["branch"] : undefined;
  const parsedBranch = isWorkflowBranch(branch) ? branch : undefined;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "animated",
    ...(parsedBranch
      ? { data: { branch: parsedBranch }, label: parsedBranch }
      : {}),
  };
}

export function referenceGraphToEditorFlow(graph: ReferenceWorkflowGraph): {
  nodes: EditorNode[];
  edges: EditorEdge[];
} {
  return {
    nodes: graph.nodes.map((node, index) => toEditorNode(node, index)),
    edges: graph.edges.map((edge) => toEditorEdge(edge)),
  };
}

export function editorFlowToReferenceGraph(
  nodes: EditorNode[],
  edges: EditorEdge[],
): ReferenceWorkflowGraph {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.type === "trigger" ? "trigger" : "action",
      position: node.position,
      data: {
        type: node.data.type,
        label: node.data.label,
        description: node.data.description,
        enabled: node.data.enabled,
        status: node.data.status,
        config: node.data.config,
      },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(isWorkflowBranch(edge.data?.branch)
        ? { data: { branch: edge.data.branch } }
        : {}),
    })),
  };
}

export function defaultWaitNode(position: {
  x: number;
  y: number;
}): EditorNode {
  return {
    id: nanoid(),
    type: "action",
    position,
    data: {
      type: "action",
      label: "Wait",
      description: "Delay execution",
      config: {
        actionType: "Wait",
        waitDuration: "PT30M",
      },
      enabled: true,
      status: "idle",
    },
  };
}

export function defaultConditionNode(position: {
  x: number;
  y: number;
}): EditorNode {
  return {
    id: nanoid(),
    type: "action",
    position,
    data: {
      type: "action",
      label: "Condition",
      description: "Branch execution",
      config: {
        actionType: "Condition",
        guard: {
          combinator: "all",
          conditions: [{ field: "trigger", operator: "exists" }],
        },
      },
      enabled: true,
      status: "idle",
    },
  };
}

export function defaultActionNode(
  position: { x: number; y: number },
  actionId: string,
): EditorNode {
  return {
    id: nanoid(),
    type: "action",
    position,
    data: {
      type: "action",
      label: actionId,
      description: "",
      config: {
        actionType: actionId,
        actionId,
        input: {},
      },
      enabled: true,
      status: "idle",
    },
  };
}
