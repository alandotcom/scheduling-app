import { useEffect, useMemo, useState } from "react";
import type {
  JourneyRun,
  JourneyRunDelivery,
  JourneyRunDetailResponse,
} from "@scheduling/dto";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDisplayDateTime } from "@/lib/date-utils";
import { orpc } from "@/lib/query";
import {
  selectedExecutionIdAtom,
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

  return reasonCode.replaceAll("_", " ");
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

export function WorkflowRunsPanelView({
  runs,
  selectedRunId,
  selectedRunDetail,
  canManageWorkflow,
  isLoadingRuns,
  isLoadingRunDetail,
  onSelectRun,
  onRefresh,
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
                      <Badge variant={toRunStatusBadgeVariant(run.status)}>
                        {run.status}
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
                            Status: <strong>{run.status}</strong>
                          </p>
                        </div>

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
  const queryClient = useQueryClient();

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
    },
    [setExecutionLogsByNodeId, setSelectedExecutionId],
  );

  useEffect(() => {
    if (!selectedExecutionId || !runDetailQuery.data) {
      setExecutionLogsByNodeId({});
      return;
    }

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

    setExecutionLogsByNodeId(latestByStep);
  }, [runDetailQuery.data, selectedExecutionId, setExecutionLogsByNodeId]);

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
      runs={runsQuery.data ?? []}
      selectedRunDetail={runDetailQuery.data ?? null}
      selectedRunId={selectedExecutionId}
    />
  );
}
