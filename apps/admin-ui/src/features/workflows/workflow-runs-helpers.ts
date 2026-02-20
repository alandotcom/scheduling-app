import type {
  JourneyRun,
  JourneyRunDelivery,
  JourneyRunDetailResponse,
  JourneyRunStepLog,
} from "@scheduling/dto";
import { linearJourneyGraphSchema } from "@scheduling/dto";
import { formatDisplayDateTime } from "@/lib/date-utils";

// ---------------------------------------------------------------------------
// Run status helpers
// ---------------------------------------------------------------------------

export function toRunStatusLabel(status: JourneyRun["status"]): string {
  switch (status) {
    case "planned":
      return "Planned";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
  }
}

export function toRunStatusBadgeVariant(
  status: JourneyRun["status"],
): "default" | "destructive" | "secondary" | "outline" {
  switch (status) {
    case "failed":
      return "destructive";
    case "completed":
      return "default";
    case "canceled":
      return "secondary";
    default:
      return "outline";
  }
}

export function isRunTerminal(status: JourneyRun["status"]): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

export function isRunActive(status: JourneyRun["status"]): boolean {
  return status === "planned" || status === "running";
}

// ---------------------------------------------------------------------------
// Step log status helpers
// ---------------------------------------------------------------------------

export function toStepLogStatusLabel(
  status: JourneyRunStepLog["status"],
): string {
  switch (status) {
    case "pending":
      return "Planned";
    case "running":
      return "Running";
    case "success":
      return "Completed";
    case "error":
      return "Failed";
    case "cancelled":
      return "Canceled";
  }
}

export function toStepLogStatusBadgeVariant(
  status: JourneyRunStepLog["status"],
): "default" | "destructive" | "secondary" | "outline" {
  switch (status) {
    case "success":
      return "default";
    case "error":
      return "destructive";
    case "cancelled":
      return "secondary";
    default:
      return "outline";
  }
}

export function toDisplayStepLogStatus(input: {
  stepLog: JourneyRunStepLog;
  runStatus: JourneyRun["status"];
}): JourneyRunStepLog["status"] {
  const { stepLog, runStatus } = input;
  if (stepLog.status !== "running") {
    return stepLog.status;
  }

  if (!isRunTerminal(runStatus)) {
    return stepLog.status;
  }

  if (runStatus === "completed") {
    return "success";
  }

  if (runStatus === "failed") {
    return "error";
  }

  return "cancelled";
}

export function toNodeLogStatus(
  status: JourneyRunStepLog["status"],
): "pending" | "running" | "success" | "error" | "cancelled" {
  return status;
}

export function toRunNodeLogStatus(
  status: JourneyRun["status"],
): "pending" | "running" | "success" | "error" | "cancelled" {
  switch (status) {
    case "planned":
      return "pending";
    case "running":
      return "running";
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "canceled":
      return "cancelled";
    default:
      return "pending";
  }
}

export function isTraversedStatus(
  status: JourneyRunStepLog["status"] | undefined,
): boolean {
  return status === "success" || status === "cancelled" || status === "error";
}

export function isActiveStatus(
  status: JourneyRunStepLog["status"] | undefined,
): boolean {
  return status === "pending" || status === "running";
}

// ---------------------------------------------------------------------------
// Delivery status helpers
// ---------------------------------------------------------------------------

export function toDeliveryStatusBadgeVariant(
  status: JourneyRunDelivery["status"],
): "default" | "destructive" | "secondary" | "outline" {
  switch (status) {
    case "failed":
      return "destructive";
    case "sent":
      return "default";
    case "canceled":
    case "skipped":
      return "secondary";
    default:
      return "outline";
  }
}

export function toDeliveryStatusLabel(
  status: JourneyRunDelivery["status"],
): string {
  switch (status) {
    case "planned":
      return "Planned";
    case "sent":
      return "Completed";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    case "skipped":
      return "Skipped";
  }
}

// ---------------------------------------------------------------------------
// Status dot color helpers (new)
// ---------------------------------------------------------------------------

export function getRunStatusDotColorClass(
  status: JourneyRun["status"],
): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500";
    case "running":
      return "bg-blue-500 animate-pulse";
    case "planned":
      return "bg-blue-400";
    case "failed":
      return "bg-red-500";
    case "canceled":
      return "bg-zinc-400";
  }
}

export function getStepStatusDotColorClass(
  status: JourneyRunStepLog["status"],
): string {
  switch (status) {
    case "success":
      return "bg-emerald-500";
    case "running":
      return "bg-blue-500 animate-pulse";
    case "pending":
      return "bg-zinc-300";
    case "error":
      return "bg-red-500";
    case "cancelled":
      return "bg-zinc-400";
  }
}

export function getDeliveryStatusDotColorClass(
  status: JourneyRunDelivery["status"],
): string {
  switch (status) {
    case "sent":
      return "bg-emerald-500";
    case "failed":
      return "bg-red-500";
    case "canceled":
    case "skipped":
      return "bg-zinc-400";
    default:
      return "bg-blue-400";
  }
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

export function toReasonCodeLabel(reasonCode: string | null): string | null {
  if (!reasonCode) {
    return null;
  }

  if (reasonCode === "past_due") {
    return "Skipped because scheduled time already passed";
  }

  if (reasonCode === "manual_cancel") {
    return "Manual cancel";
  }

  if (reasonCode === "execution_terminal") {
    return "Execution terminal";
  }

  if (reasonCode === "appointment_confirmed") {
    return "Appointment confirmed";
  }

  if (reasonCode === "wait_for_confirmation_timeout") {
    return "Wait for confirmation timed out";
  }

  if (reasonCode === "confirmation_not_required") {
    return "Confirmation not required";
  }

  if (reasonCode === "delivery_missing") {
    return "Delivery missing";
  }

  if (reasonCode.startsWith("provider_error:")) {
    return "Provider error";
  }

  if (reasonCode === "test_mode_log_only") {
    return "Test mode: log only";
  }

  if (reasonCode === "test_mode_routed_integration_recipient") {
    return "Test mode: routed to integration test recipient";
  }

  if (reasonCode === "test_mode_log_fallback_missing_recipient") {
    return "Test mode: auto log-only fallback (missing test recipient)";
  }

  return reasonCode.replaceAll("_", " ");
}

export function toEventTypeLabel(eventType: string | null): string {
  if (!eventType) {
    return "Unknown event";
  }

  return eventType.replaceAll(".", " / ");
}

export function toNodeTypeLabel(nodeType: string): string {
  switch (nodeType.trim().toLowerCase()) {
    case "trigger":
      return "Trigger";
    case "wait":
      return "Wait";
    case "condition":
      return "If / else";
    case "logger":
      return "Logger";
    case "send-resend":
    case "email":
      return "Send email";
    case "send-resend-template":
      return "Send email template";
    case "send-slack":
    case "slack":
      return "Send Slack message";
    case "send-twilio":
    case "sms":
      return "Send SMS";
    default:
      return nodeType.replaceAll("-", " ");
  }
}

export function toTimelineLabel(delivery: JourneyRunDelivery): string {
  if (delivery.channel === "logger") {
    return "Logger entry";
  }

  return `Send (${delivery.channel.toUpperCase()})`;
}

// ---------------------------------------------------------------------------
// Duration / countdown formatting
// ---------------------------------------------------------------------------

export function formatDurationMs(durationMs: number | null): string | null {
  if (durationMs === null) {
    return null;
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

export function formatCountdownDuration(totalMs: number): string {
  const safeMs = Math.max(0, Math.floor(totalMs));
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

// ---------------------------------------------------------------------------
// Node detail value formatting
// ---------------------------------------------------------------------------

export function formatNodeDetailValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return formatDisplayDateTime(value);
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : `${value.length} items`;
  }

  return "Object";
}

export function toNodeDetailEntries(
  value: Record<string, unknown> | null,
): Array<{ key: string; value: string }> {
  if (!value) {
    return [];
  }

  return Object.entries(value)
    .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined)
    .slice(0, 8)
    .map(([key, entryValue]) => ({
      key,
      value: formatNodeDetailValue(entryValue),
    }));
}

// ---------------------------------------------------------------------------
// Test safety summary
// ---------------------------------------------------------------------------

export function summarizeTestSafetyOutcomes(deliveries: JourneyRunDelivery[]): {
  routedCount: number;
  logOnlyCount: number;
  fallbackCount: number;
} {
  let routedCount = 0;
  let logOnlyCount = 0;
  let fallbackCount = 0;

  for (const delivery of deliveries) {
    if (delivery.reasonCode === "test_mode_routed_integration_recipient") {
      routedCount += 1;
      continue;
    }

    if (delivery.reasonCode === "test_mode_log_fallback_missing_recipient") {
      fallbackCount += 1;
      continue;
    }

    if (delivery.reasonCode === "test_mode_log_only") {
      logOnlyCount += 1;
    }
  }

  return { routedCount, logOnlyCount, fallbackCount };
}

// ---------------------------------------------------------------------------
// Record / JSON utilities
// ---------------------------------------------------------------------------

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// Graph snapshot parsing
// ---------------------------------------------------------------------------

export function parseRunSnapshotGraph(runDetail: JourneyRunDetailResponse) {
  const snapshot = runDetail.runSnapshot;
  if (!isRecord(snapshot)) {
    return null;
  }

  const parsed = linearJourneyGraphSchema.safeParse(
    snapshot["definitionSnapshot"],
  );
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export function getStepLabelByStepKey(
  runDetail: JourneyRunDetailResponse,
): Record<string, string> {
  const graph = parseRunSnapshotGraph(runDetail);
  if (!graph) {
    return {};
  }

  return graph.nodes.reduce<Record<string, string>>((acc, node) => {
    const nodeId = node.attributes.id;
    const nodeData: Record<string, unknown> = isRecord(node.attributes.data)
      ? node.attributes.data
      : {};
    const label = nodeData["label"];
    if (typeof label === "string" && label.trim().length > 0) {
      acc[nodeId] = label.trim();
      return acc;
    }

    if (nodeData["type"] === "trigger") {
      acc[nodeId] = "Trigger";
      return acc;
    }

    const config = isRecord(nodeData["config"]) ? nodeData["config"] : null;
    const actionType =
      typeof config?.["actionType"] === "string" ? config["actionType"] : "";
    acc[nodeId] = actionType.length > 0 ? toNodeTypeLabel(actionType) : "Step";

    return acc;
  }, {});
}

// ---------------------------------------------------------------------------
// Edge execution status map
// ---------------------------------------------------------------------------

export function getEdgeExecutionStatusMap(
  runDetail: JourneyRunDetailResponse,
): Record<string, "default" | "active" | "traversed"> {
  const graph = parseRunSnapshotGraph(runDetail);
  if (!graph) {
    return {};
  }

  const statusByNodeId = new Map(
    runDetail.stepLogs.map((stepLog) => [
      stepLog.stepKey,
      toDisplayStepLogStatus({
        stepLog,
        runStatus: runDetail.run.status,
      }),
    ]),
  );

  const edgeStatusById: Record<string, "default" | "active" | "traversed"> = {};
  for (const edge of graph.edges) {
    const edgeId = edge.attributes.id;
    const targetStatus = statusByNodeId.get(edge.target);
    if (isTraversedStatus(targetStatus)) {
      edgeStatusById[edgeId] = "traversed";
      continue;
    }

    if (isActiveStatus(targetStatus)) {
      edgeStatusById[edgeId] = "active";
    }
  }

  return edgeStatusById;
}

// ---------------------------------------------------------------------------
// Step log detail helpers
// ---------------------------------------------------------------------------

function getRecordPropertyDate(
  record: Record<string, unknown>,
  key: string,
): string | Date | undefined {
  const value = record[key];
  if (typeof value === "string" || value instanceof Date) {
    return value;
  }

  return undefined;
}

export function resolveStepLogWaitUntil(
  stepLog: JourneyRunStepLog,
): string | Date | undefined {
  if (stepLog.nodeType !== "wait") {
    return undefined;
  }

  const output = isRecord(stepLog.output) ? stepLog.output : null;
  if (output) {
    const waitUntil =
      getRecordPropertyDate(output, "waitUntil") ??
      getRecordPropertyDate(output, "scheduledFor");
    if (waitUntil) {
      return waitUntil;
    }
  }

  const input = isRecord(stepLog.input) ? stepLog.input : null;
  if (input) {
    return getRecordPropertyDate(input, "waitUntil");
  }

  return undefined;
}

function toLocalDisplayDate(value: string | Date): Date | string {
  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return value;
}

export function resolveTimelineStepLogForNode(input: {
  selectedNodeId: string | null;
  runDetail: JourneyRunDetailResponse;
}): JourneyRunStepLog | null {
  if (!input.selectedNodeId) {
    return null;
  }

  return (
    input.runDetail.stepLogs.find(
      (stepLog) => stepLog.stepKey === input.selectedNodeId,
    ) ?? null
  );
}

function getStepLogReasonCode(stepLog: JourneyRunStepLog): string | null {
  if (!isRecord(stepLog.output)) {
    return null;
  }

  const reasonCode = stepLog.output["reasonCode"];
  return typeof reasonCode === "string" ? reasonCode : null;
}

export function toStepLogDisplaySubtitle(input: {
  stepLog: JourneyRunStepLog;
  displayStatus: JourneyRunStepLog["status"];
  nowMs?: number;
}): string | null {
  const { stepLog, displayStatus, nowMs } = input;
  const waitUntil = resolveStepLogWaitUntil(stepLog);
  if (stepLog.nodeType === "wait" && waitUntil && displayStatus === "running") {
    const waitUntilDate = new Date(waitUntil);
    if (Number.isNaN(waitUntilDate.getTime()) || !nowMs) {
      return `Waiting until ${formatDisplayDateTime(toLocalDisplayDate(waitUntil))}`;
    }

    const remainingMs = waitUntilDate.getTime() - nowMs;
    if (remainingMs > 0) {
      return `Waiting - ${formatCountdownDuration(remainingMs)} remaining`;
    }

    return `Waiting until ${formatDisplayDateTime(waitUntilDate)}`;
  }

  const reasonLabel = toReasonCodeLabel(getStepLogReasonCode(stepLog));
  if (reasonLabel) {
    return reasonLabel;
  }

  if (isRecord(stepLog.output)) {
    const matched = stepLog.output["matched"];
    if (typeof matched === "boolean") {
      return matched ? "Condition matched" : "Condition did not match";
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Node type resolution from graph snapshot
// ---------------------------------------------------------------------------

export function getNodeTypeByStepKey(
  runDetail: JourneyRunDetailResponse,
): Record<string, string> {
  const graph = parseRunSnapshotGraph(runDetail);
  if (!graph) {
    return {};
  }

  return graph.nodes.reduce<Record<string, string>>((acc, node) => {
    const nodeId = node.attributes.id;
    const nodeData: Record<string, unknown> = isRecord(node.attributes.data)
      ? node.attributes.data
      : {};

    if (nodeData["type"] === "trigger") {
      acc[nodeId] = "trigger";
      return acc;
    }

    const config = isRecord(nodeData["config"]) ? nodeData["config"] : null;
    const actionType =
      typeof config?.["actionType"] === "string" ? config["actionType"] : "";
    acc[nodeId] = actionType;

    return acc;
  }, {});
}
