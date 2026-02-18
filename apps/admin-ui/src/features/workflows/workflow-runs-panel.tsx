import { useEffect, useMemo, useState } from "react";
import type {
  JourneyRun,
  JourneyRunDelivery,
  JourneyRunDetailResponse,
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
  status: JourneyRunDelivery["status"],
): "pending" | "running" | "success" | "error" | "cancelled" {
  switch (status) {
    case "planned":
      return "pending";
    case "sent":
      return "success";
    case "failed":
      return "error";
    case "canceled":
    case "skipped":
      return "cancelled";
    default:
      return "pending";
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

function isRunActive(status: JourneyRun["status"]): boolean {
  return status === "planned" || status === "running";
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
                        {runStatus}
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
                            Status: <strong>{runStatus}</strong>
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

                        {selectedRunDetail.deliveries.length > 0 ? (
                          <div className="space-y-1">
                            <p className="font-medium text-xs">Timeline</p>
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
                                      {delivery.status}
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
      setExecutionViewGraph(null);
    },
    [setExecutionLogsByNodeId, setExecutionViewGraph, setSelectedExecutionId],
  );

  useEffect(() => {
    if (!selectedExecutionId || !runDetailQuery.data) {
      setExecutionLogsByNodeId({});
      setExecutionViewGraph(null);
      return;
    }

    const runSnapshotGraph = parseRunSnapshotGraph(runDetailQuery.data);
    setExecutionViewGraph(
      runSnapshotGraph ? deserializeWorkflowGraph(runSnapshotGraph) : null,
    );

    const latestByStep = runDetailQuery.data.deliveries.reduce<
      Record<
        string,
        {
          nodeId: string;
          status: "pending" | "running" | "success" | "error" | "cancelled";
          input?: unknown;
          startedAt?: string | Date;
        }
      >
    >((acc, delivery) => {
      acc[delivery.stepKey] = {
        nodeId: delivery.stepKey,
        status: toNodeLogStatus(delivery.status),
        startedAt: delivery.scheduledFor,
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
  }, [
    runDetailQuery.data,
    selectedExecutionId,
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
