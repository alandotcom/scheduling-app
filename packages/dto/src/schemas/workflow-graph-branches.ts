import type { SerializedWorkflowEdge } from "./workflow-graph";

// Decoding of journey graph edge "branch" labels. The wire encoding (a branch
// can be carried on edge.attributes.data.{conditionBranch,triggerBranch},
// edge.attributes.label, or edge.attributes.sourceHandle) is a single design
// decision owned here, used by both the graph validator (DTO) and the runtime
// graph walk (planner). Keeping it in one module prevents the two from drifting.

export type ConditionBranch = "true" | "false";
export type TriggerBranch = "scheduled" | "canceled" | "no_show";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function edgeAttributes(edge: SerializedWorkflowEdge): Record<string, unknown> {
  return isRecord(edge.attributes) ? edge.attributes : {};
}

function edgeData(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  return isRecord(attributes["data"]) ? attributes["data"] : {};
}

export function normalizeConditionBranch(
  value: unknown,
): ConditionBranch | null {
  if (typeof value !== "string") {
    return null;
  }

  let normalized = value.trim().toLowerCase();
  if (normalized.startsWith("branch-")) {
    normalized = normalized.slice("branch-".length);
  }

  if (normalized === "true" || normalized === "false") {
    return normalized;
  }

  return null;
}

export function getConditionBranchFromEdge(
  edge: SerializedWorkflowEdge,
): ConditionBranch | null {
  const attributes = edgeAttributes(edge);
  const data = edgeData(attributes);

  return (
    normalizeConditionBranch(data["conditionBranch"]) ??
    normalizeConditionBranch(attributes["label"]) ??
    normalizeConditionBranch(attributes["sourceHandle"])
  );
}

export function normalizeTriggerBranch(value: unknown): TriggerBranch | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[\s-]+/g, "_");
  if (
    normalized === "scheduled" ||
    normalized === "canceled" ||
    normalized === "no_show"
  ) {
    return normalized;
  }

  if (normalized === "noshow") {
    return "no_show";
  }

  return null;
}

export function getTriggerBranchFromEdge(
  edge: SerializedWorkflowEdge,
): TriggerBranch | null {
  const attributes = edgeAttributes(edge);
  const data = edgeData(attributes);

  return (
    normalizeTriggerBranch(data["triggerBranch"]) ??
    normalizeTriggerBranch(attributes["label"]) ??
    normalizeTriggerBranch(attributes["sourceHandle"])
  );
}
