import type { ConditionBranch, TriggerBranch } from "@scheduling/dto";

// Single source of truth for interpreting a workflow-graph edge's branch.
//
// A branch is encoded in two places on an edge:
//   - `data.conditionBranch` / `data.triggerBranch` — the authoritative
//     semantic record.
//   - `sourceHandle` — the React Flow handle id, used as a fallback.
//   - `label` — a human label that can also carry the branch (legacy/manual).
//
// The branch value types derive from the DTO zod enums so the persisted
// contract and this decoder cannot drift.

type EdgeLike = {
  data?: unknown;
  label?: unknown;
  // Accept any handle id shape; the normalizers defensively handle non-strings.
  sourceHandle?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
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

export function getConditionBranch(edge: EdgeLike): ConditionBranch | null {
  const edgeData = asRecord(edge.data);
  const dataBranch = normalizeConditionBranch(edgeData?.["conditionBranch"]);
  if (dataBranch) {
    return dataBranch;
  }

  const labelBranch = normalizeConditionBranch(edge.label);
  if (labelBranch) {
    return labelBranch;
  }

  return normalizeConditionBranch(edge.sourceHandle);
}

export function getTriggerBranch(edge: EdgeLike): TriggerBranch | null {
  const edgeData = asRecord(edge.data);
  const dataBranch = normalizeTriggerBranch(edgeData?.["triggerBranch"]);
  if (dataBranch) {
    return dataBranch;
  }

  const labelBranch = normalizeTriggerBranch(edge.label);
  if (labelBranch) {
    return labelBranch;
  }

  return normalizeTriggerBranch(edge.sourceHandle);
}

export function conditionBranchLabel(branch: ConditionBranch): string {
  return branch === "true" ? "True" : "False";
}

export function triggerBranchLabel(branch: TriggerBranch): string {
  if (branch === "scheduled") {
    return "Scheduled";
  }

  if (branch === "canceled") {
    return "Canceled";
  }

  return "No Show";
}
