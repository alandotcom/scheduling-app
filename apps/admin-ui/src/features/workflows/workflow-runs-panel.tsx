import { useEffect, useMemo, useState } from "react";
import type {
  JourneyRun,
  JourneyRunDelivery,
  JourneyRunDetailResponse,
  JourneyRunEvent,
  JourneyRunStepLog,
} from "@scheduling/dto";
import { linearJourneyGraphSchema } from "@scheduling/dto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom, useSetAtom } from "jotai";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDisplayDateTime } from "@/lib/date-utils";
import { orpc } from "@/lib/query";
import {
  deserializeWorkflowGraph,
  selectedExecutionIdAtom,
  workflowExecutionEdgeStatusByEdgeIdAtom,
  workflowExecutionViewGraphAtom,
  workflowExecutionLogsByNodeIdAtom,
} from "./workflow-editor-store";

interface WorkflowRunsPanelProps {
  workflowId: string | null;
  canManageWorkflow: boolean;
}

interface WorkflowRunsPanelViewProps {
  runs: JourneyRun[];
  selectedRunId: string | null;
  selectedRunDetail: JourneyRunDetailResponse | null;
  canManageWorkflow: boolean;
  isLoadingRuns: boolean;
  isLoadingRunDetail: boolean;
  onSelectRun: (runId: string | null) => void;
  onRefresh: () => void;
  onCancelRun?: (runId: string) => void;
  onCancelJourneyRuns?: () => void;
  isCancelRunPending?: boolean;
  isCancelJourneyRunsPending?: boolean;
}

type RunModeFilter = "all" | "live" | "test";

function toRunStatusBadgeVariant(
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

function toRunStatusLabel(status: JourneyRun["status"]): string {
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

function toDeliveryStatusBadgeVariant(
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

function toDeliveryStatusLabel(status: JourneyRunDelivery["status"]): string {
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

function toStepLogStatusBadgeVariant(
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

function toStepLogStatusLabel(status: JourneyRunStepLog["status"]): string {
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

function isRunTerminal(status: JourneyRun["status"]): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

function toReasonCodeLabel(reasonCode: string | null): string | null {
  if (!reasonCode) {
    return null;
  }

  if (reasonCode === "past_due") {
    return "Past due";
  }

  if (reasonCode === "manual_cancel") {
    return "Manual cancel";
  }

  if (reasonCode === "execution_terminal") {
    return "Execution terminal";
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

function toNodeTypeLabel(nodeType: string): string {
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
    default:
      return nodeType.replaceAll("-", " ");
  }
}

function formatDurationMs(durationMs: number | null): string | null {
  if (durationMs === null) {
    return null;
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function summarizeTestSafetyOutcomes(deliveries: JourneyRunDelivery[]): {
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

  return {
    routedCount,
    logOnlyCount,
    fallbackCount,
  };
}

function toTimelineLabel(delivery: JourneyRunDelivery): string {
  if (delivery.channel === "logger") {
    return "Logger entry";
  }

  return `Send (${delivery.channel.toUpperCase()})`;
}

function toNodeLogStatus(
  status: JourneyRunStepLog["status"],
): "pending" | "running" | "success" | "error" | "cancelled" {
  switch (status) {
    case "pending":
      return "pending";
    case "running":
      return "running";
    case "success":
      return "success";
    case "error":
      return "error";
    case "cancelled":
      return "cancelled";
  }
}

function toRunNodeLogStatus(
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRunSnapshotGraph(runDetail: JourneyRunDetailResponse) {
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

function getStepLabelByStepKey(
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

function resolveStepLogWaitUntil(
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

function toDisplayStepLogStatus(input: {
  stepLog: JourneyRunStepLog;
  runStatus: JourneyRun["status"];
}): JourneyRunStepLog["status"] {
  const { stepLog, runStatus } = input;
  if (stepLog.nodeType !== "wait" || stepLog.status !== "running") {
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

function isTraversedStatus(
  status: JourneyRunStepLog["status"] | undefined,
): boolean {
  return status === "success" || status === "cancelled" || status === "error";
}

function isActiveStatus(
  status: JourneyRunStepLog["status"] | undefined,
): boolean {
  return status === "pending" || status === "running";
}

function getStepLogReasonCode(stepLog: JourneyRunStepLog): string | null {
  if (!isRecord(stepLog.output)) {
    return null;
  }

  const reasonCode = stepLog.output["reasonCode"];
  return typeof reasonCode === "string" ? reasonCode : null;
}

function toStepLogDisplaySubtitle(input: {
  stepLog: JourneyRunStepLog;
  displayStatus: JourneyRunStepLog["status"];
}): string | null {
  const { stepLog, displayStatus } = input;
  const waitUntil = resolveStepLogWaitUntil(stepLog);
  if (stepLog.nodeType === "wait" && waitUntil && displayStatus === "running") {
    return `Waiting until ${formatDisplayDateTime(toLocalDisplayDate(waitUntil))}`;
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

function getEdgeExecutionStatusMap(
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

function isRunActive(status: JourneyRun["status"]): boolean {
  return status === "planned" || status === "running";
}

function toJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function WorkflowRunsPanelView({
  runs,
  selectedRunId,
  selectedRunDetail,
  canManageWorkflow,
  isLoadingRuns,
  isLoadingRunDetail,
  onSelectRun,
  onRefresh,
  onCancelRun,
  onCancelJourneyRuns,
  isCancelRunPending = false,
  isCancelJourneyRunsPending = false,
}: WorkflowRunsPanelViewProps) {
  const [modeFilter, setModeFilter] = useState<RunModeFilter>("all");
  const [expandedStepLogIds, setExpandedStepLogIds] = useState<Set<string>>(
    new Set(),
  );
  const [advancedRunIds, setAdvancedRunIds] = useState<Set<string>>(new Set());

  const filteredRuns = useMemo(() => {
    if (modeFilter === "all") {
      return runs;
    }

    return runs.filter((run) => run.mode === modeFilter);
  }, [modeFilter, runs]);

  if (isLoadingRuns) {
    return <p className="text-muted-foreground text-sm">Loading runs...</p>;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium text-sm">Runs</h2>
        <Button onClick={onRefresh} size="sm" variant="outline">
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => setModeFilter("all")}
          size="sm"
          variant={modeFilter === "all" ? "default" : "outline"}
        >
          All
        </Button>
        <Button
          onClick={() => setModeFilter("live")}
          size="sm"
          variant={modeFilter === "live" ? "default" : "outline"}
        >
          Live
        </Button>
        <Button
          onClick={() => setModeFilter("test")}
          size="sm"
          variant={modeFilter === "test" ? "default" : "outline"}
        >
          Test
        </Button>
      </div>

      {filteredRuns.length === 0 ? (
        <p className="text-muted-foreground text-sm">No runs yet.</p>
      ) : null}

      {filteredRuns.length > 0 ? (
        <div className="space-y-2">
          {filteredRuns.map((run) => {
            const isSelected = selectedRunId === run.id;
            const runStatus =
              selectedRunDetail?.run.id === run.id
                ? selectedRunDetail.run.status
                : run.status;
            const canCancelThisRun =
              canManageWorkflow && isRunActive(runStatus);
            const testSafetySummary =
              selectedRunDetail?.run.id === run.id && run.mode === "test"
                ? summarizeTestSafetyOutcomes(selectedRunDetail.deliveries)
                : null;
            const runEvents =
              selectedRunDetail?.run.id === run.id
                ? selectedRunDetail.events
                : [];
            const stepLogs =
              selectedRunDetail?.run.id === run.id
                ? selectedRunDetail.stepLogs
                : [];
            const stepLabelByStepKey =
              selectedRunDetail?.run.id === run.id
                ? getStepLabelByStepKey(selectedRunDetail)
                : {};
            const showAdvanced = advancedRunIds.has(run.id);

            return (
              <article
                className={
                  isSelected
                    ? "rounded-md border border-primary bg-background"
                    : "rounded-md border bg-background"
                }
                key={run.id}
              >
                <button
                  className="w-full rounded-md p-3 text-left hover:bg-muted/30"
                  onClick={() => onSelectRun(isSelected ? null : run.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">
                      {`Run for ${run.journeyNameSnapshot}`}
                    </span>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline">{run.mode.toUpperCase()}</Badge>
                      <Badge variant={toRunStatusBadgeVariant(runStatus)}>
                        {toRunStatusLabel(runStatus)}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-muted-foreground text-xs">
                    Started {formatDisplayDateTime(run.startedAt)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {run.journeyVersion
                      ? `Version ${run.journeyVersion}`
                      : "Version unknown"}
                    {run.journeyDeleted ? " • Deleted journey" : ""}
                  </p>
                </button>

                {isSelected ? (
                  <div className="space-y-3 border-t px-3 py-3">
                    {isLoadingRunDetail ? (
                      <p className="text-muted-foreground text-xs">
                        Loading timeline...
                      </p>
                    ) : null}

                    {selectedRunDetail ? (
                      <>
                        <div className="space-y-1 rounded-md bg-muted/40 p-2 text-xs">
                          <p>
                            Journey: <strong>{run.journeyNameSnapshot}</strong>
                          </p>
                          <p>
                            Mode: <strong>{run.mode}</strong>
                          </p>
                          <p>
                            Status:{" "}
                            <strong>{toRunStatusLabel(runStatus)}</strong>
                          </p>
                        </div>

                        {run.mode === "test" ? (
                          <div className="space-y-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs">
                            <p className="font-medium">
                              Test mode safety: real external recipients are
                              blocked.
                            </p>
                            <p className="text-muted-foreground">
                              Routed: {testSafetySummary?.routedCount ?? 0} •
                              Log-only: {testSafetySummary?.logOnlyCount ?? 0} •
                              Auto-fallback:{" "}
                              {testSafetySummary?.fallbackCount ?? 0}
                            </p>
                          </div>
                        ) : null}

                        {canCancelThisRun ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              disabled={
                                !onCancelRun ||
                                isCancelRunPending ||
                                isCancelJourneyRunsPending
                              }
                              onClick={() => onCancelRun?.(run.id)}
                              size="sm"
                              variant="destructive"
                            >
                              {isCancelRunPending
                                ? "Canceling run..."
                                : "Cancel this run"}
                            </Button>
                            <Button
                              disabled={
                                !onCancelJourneyRuns ||
                                isCancelRunPending ||
                                isCancelJourneyRunsPending
                              }
                              onClick={() => onCancelJourneyRuns?.()}
                              size="sm"
                              variant="outline"
                            >
                              {isCancelJourneyRunsPending
                                ? "Canceling journey runs..."
                                : "Cancel all active runs for this journey"}
                            </Button>
                          </div>
                        ) : null}

                        {stepLogs.length > 0 ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-xs uppercase tracking-wide">
                                Timeline
                              </p>
                              <p className="text-muted-foreground text-[11px]">
                                {stepLogs.length}{" "}
                                {stepLogs.length === 1 ? "step" : "steps"}
                              </p>
                            </div>
                            {stepLogs.map((stepLog) => {
                              const isExpanded = expandedStepLogIds.has(
                                stepLog.id,
                              );
                              const displayStatus = toDisplayStepLogStatus({
                                stepLog,
                                runStatus,
                              });
                              const stepLabel =
                                stepLabelByStepKey[stepLog.stepKey] ??
                                toNodeTypeLabel(stepLog.nodeType);
                              const stepSubtitle = toStepLogDisplaySubtitle({
                                stepLog,
                                displayStatus,
                              });
                              const duration = formatDurationMs(
                                stepLog.durationMs,
                              );

                              return (
                                <div
                                  className="rounded-md border bg-background px-2 py-1 text-xs"
                                  key={stepLog.id}
                                >
                                  <button
                                    className="w-full text-left"
                                    onClick={() => {
                                      setExpandedStepLogIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(stepLog.id)) {
                                          next.delete(stepLog.id);
                                        } else {
                                          next.add(stepLog.id);
                                        }
                                        return next;
                                      });
                                    }}
                                    type="button"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="truncate font-medium text-sm">
                                          {stepLabel}
                                        </p>
                                        <p className="text-muted-foreground text-[11px]">
                                          {formatDisplayDateTime(
                                            stepLog.startedAt,
                                          )}
                                        </p>
                                        {stepSubtitle ? (
                                          <p className="truncate text-muted-foreground text-[11px]">
                                            {stepSubtitle}
                                          </p>
                                        ) : null}
                                      </div>
                                      <div className="flex shrink-0 flex-col items-end gap-1">
                                        <Badge
                                          variant={toStepLogStatusBadgeVariant(
                                            displayStatus,
                                          )}
                                        >
                                          {toStepLogStatusLabel(displayStatus)}
                                        </Badge>
                                        {duration ? (
                                          <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                                            {duration}
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>
                                  </button>
                                  {isExpanded ? (
                                    <div className="mt-2 space-y-2 border-t pt-2">
                                      {stepLog.input ? (
                                        <div className="space-y-1">
                                          <p className="font-medium text-[11px] text-muted-foreground">
                                            Input
                                          </p>
                                          <pre className="overflow-auto rounded border bg-muted/30 p-2 text-[11px]">
                                            {toJson(stepLog.input)}
                                          </pre>
                                        </div>
                                      ) : null}
                                      {stepLog.output ? (
                                        <div className="space-y-1">
                                          <p className="font-medium text-[11px] text-muted-foreground">
                                            Output
                                          </p>
                                          <pre className="overflow-auto rounded border bg-muted/30 p-2 text-[11px]">
                                            {toJson(stepLog.output)}
                                          </pre>
                                        </div>
                                      ) : null}
                                      {stepLog.error ? (
                                        <div className="space-y-1">
                                          <p className="font-medium text-[11px] uppercase tracking-wide text-destructive">
                                            Error
                                          </p>
                                          <pre className="overflow-auto rounded border border-destructive/30 bg-destructive/10 p-2 text-[11px]">
                                            {stepLog.error}
                                          </pre>
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : selectedRunDetail.deliveries.length > 0 ? (
                          <div className="space-y-2">
                            <p className="font-medium text-xs uppercase tracking-wide">
                              Timeline
                            </p>
                            {selectedRunDetail.deliveries.map((delivery) => {
                              const reasonLabel = toReasonCodeLabel(
                                delivery.reasonCode,
                              );

                              return (
                                <div
                                  className="rounded border px-2 py-1 text-xs"
                                  key={delivery.id}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium">
                                      {toTimelineLabel(delivery)}
                                    </span>
                                    <Badge
                                      variant={toDeliveryStatusBadgeVariant(
                                        delivery.status,
                                      )}
                                    >
                                      {toDeliveryStatusLabel(delivery.status)}
                                    </Badge>
                                  </div>
                                  <p className="text-muted-foreground text-[11px]">
                                    {formatDisplayDateTime(
                                      delivery.scheduledFor,
                                    )}
                                  </p>
                                  {reasonLabel ? (
                                    <p className="text-muted-foreground text-[11px]">
                                      {reasonLabel}
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-xs">
                            No timeline entries yet.
                          </p>
                        )}

                        {runEvents.length > 0 || stepLogs.length > 0 ? (
                          <div className="space-y-2">
                            <Button
                              onClick={() => {
                                setAdvancedRunIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(run.id)) {
                                    next.delete(run.id);
                                  } else {
                                    next.add(run.id);
                                  }
                                  return next;
                                });
                              }}
                              size="sm"
                              variant="outline"
                            >
                              {showAdvanced
                                ? "Hide advanced details"
                                : "Show advanced details"}
                            </Button>

                            {showAdvanced && runEvents.length > 0 ? (
                              <div className="space-y-2 rounded-md border bg-muted/15 p-2">
                                <p className="font-medium text-xs uppercase tracking-wide">
                                  Audit events
                                </p>
                                <div className="space-y-2">
                                  {runEvents.map((event: JourneyRunEvent) => (
                                    <div
                                      className="flex items-center justify-between rounded border bg-background px-2 py-1 text-xs"
                                      key={event.id}
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate font-medium">
                                          {event.message}
                                        </p>
                                        <p className="truncate text-muted-foreground">
                                          {event.eventType}
                                        </p>
                                      </div>
                                      <span className="shrink-0 text-[11px] text-muted-foreground">
                                        {formatDisplayDateTime(event.createdAt)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      {!canManageWorkflow ? (
        <p className="text-muted-foreground text-xs">
          Read-only mode: members can inspect runs but cannot mutate them.
        </p>
      ) : null}
    </section>
  );
}

export function WorkflowRunsPanel({
  workflowId,
  canManageWorkflow,
}: WorkflowRunsPanelProps) {
  const [selectedExecutionId, setSelectedExecutionId] = useAtom(
    selectedExecutionIdAtom,
  );
  const [, setExecutionLogsByNodeId] = useAtom(
    workflowExecutionLogsByNodeIdAtom,
  );
  const setExecutionEdgeStatusByEdgeId = useSetAtom(
    workflowExecutionEdgeStatusByEdgeIdAtom,
  );
  const setExecutionViewGraph = useSetAtom(workflowExecutionViewGraphAtom);
  const queryClient = useQueryClient();

  const cancelRunMutation = useMutation(
    orpc.journeys.runs.cancel.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.journeys.runs.list.key(),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.journeys.runs.get.key(),
        });
      },
    }),
  );

  const cancelJourneyRunsMutation = useMutation(
    orpc.journeys.cancelRuns.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.journeys.runs.list.key(),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.journeys.runs.get.key(),
        });
      },
    }),
  );

  const runsQuery = useQuery({
    ...orpc.journeys.runs.list.queryOptions({
      input: {
        id: workflowId ?? "00000000-0000-0000-0000-000000000000",
        limit: 20,
      },
    }),
    enabled: Boolean(workflowId),
    refetchInterval: (query) => {
      const hasActiveRuns =
        query.state.data?.some(
          (run) => run.status === "running" || run.status === "planned",
        ) ?? false;

      return hasActiveRuns ? 2000 : false;
    },
  });

  const runDetailQuery = useQuery({
    ...orpc.journeys.runs.get.queryOptions({
      input: {
        runId: selectedExecutionId ?? "00000000-0000-0000-0000-000000000000",
      },
    }),
    enabled: Boolean(selectedExecutionId),
    refetchInterval: 2000,
  });

  useEffect(
    () => () => {
      setSelectedExecutionId(null);
      setExecutionLogsByNodeId({});
      setExecutionEdgeStatusByEdgeId({});
      setExecutionViewGraph(null);
    },
    [
      setExecutionEdgeStatusByEdgeId,
      setExecutionLogsByNodeId,
      setExecutionViewGraph,
      setSelectedExecutionId,
    ],
  );

  useEffect(() => {
    if (!selectedExecutionId || !runDetailQuery.data) {
      setExecutionLogsByNodeId({});
      setExecutionEdgeStatusByEdgeId({});
      setExecutionViewGraph(null);
      return;
    }

    const runSnapshotGraph = parseRunSnapshotGraph(runDetailQuery.data);
    setExecutionViewGraph(
      runSnapshotGraph ? deserializeWorkflowGraph(runSnapshotGraph) : null,
    );

    const latestByStep = runDetailQuery.data.stepLogs.reduce<
      Record<
        string,
        {
          nodeId: string;
          status: "pending" | "running" | "success" | "error" | "cancelled";
          input?: unknown;
          output?: unknown;
          waitUntil?: string | Date;
          error?: string | null;
          startedAt?: string | Date;
        }
      >
    >((acc, stepLog) => {
      const displayStatus = toDisplayStepLogStatus({
        stepLog,
        runStatus: runDetailQuery.data.run.status,
      });
      acc[stepLog.stepKey] = {
        nodeId: stepLog.stepKey,
        status: toNodeLogStatus(displayStatus),
        input: stepLog.input ?? undefined,
        output: stepLog.output ?? undefined,
        waitUntil: resolveStepLogWaitUntil(stepLog),
        error: stepLog.error,
        startedAt: stepLog.startedAt,
      };

      return acc;
    }, {});

    const triggerNodeId = runSnapshotGraph?.nodes.find(
      (node) => node.attributes.data.type === "trigger",
    )?.attributes.id;
    if (triggerNodeId) {
      latestByStep[triggerNodeId] = {
        nodeId: triggerNodeId,
        status: toRunNodeLogStatus(runDetailQuery.data.run.status),
        startedAt: runDetailQuery.data.run.startedAt,
      };
    }

    setExecutionLogsByNodeId(latestByStep);
    setExecutionEdgeStatusByEdgeId(
      getEdgeExecutionStatusMap(runDetailQuery.data),
    );
  }, [
    runDetailQuery.data,
    selectedExecutionId,
    setExecutionEdgeStatusByEdgeId,
    setExecutionLogsByNodeId,
    setExecutionViewGraph,
  ]);

  if (!workflowId) {
    return (
      <p className="text-muted-foreground text-sm">
        Save the workflow before viewing run history.
      </p>
    );
  }

  return (
    <WorkflowRunsPanelView
      canManageWorkflow={canManageWorkflow}
      isLoadingRunDetail={runDetailQuery.isLoading}
      isLoadingRuns={runsQuery.isLoading}
      onRefresh={() => {
        queryClient.invalidateQueries({
          queryKey: orpc.journeys.runs.list.key(),
        });
      }}
      onSelectRun={setSelectedExecutionId}
      onCancelJourneyRuns={() => {
        if (!workflowId) {
          return;
        }

        cancelJourneyRunsMutation.mutate({ id: workflowId });
      }}
      onCancelRun={(runId) => {
        cancelRunMutation.mutate({ runId });
      }}
      runs={runsQuery.data ?? []}
      isCancelJourneyRunsPending={cancelJourneyRunsMutation.isPending}
      isCancelRunPending={cancelRunMutation.isPending}
      selectedRunDetail={runDetailQuery.data ?? null}
      selectedRunId={selectedExecutionId}
    />
  );
}
