import { useEffect, useMemo, useState } from "react";
import type {
  JourneyRun,
  JourneyRunDetailResponse,
  JourneyRunEvent,
} from "@scheduling/dto";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { formatDisplayDateTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import {
  getNodeTypeByStepKey,
  getRunStatusDotColorClass,
  getStepLabelByStepKey,
  isRunActive,
  summarizeTestSafetyOutcomes,
  toRunStatusLabel,
} from "./workflow-runs-helpers";
import { WorkflowRunTimeline } from "./workflow-run-timeline";

interface WorkflowRunDetailProps {
  run: JourneyRun;
  runDetail: JourneyRunDetailResponse | null;
  isLoadingDetail: boolean;
  canManageWorkflow: boolean;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onBack: () => void;
  onCancelRun?: (runId: string) => void;
  onCancelJourneyRuns?: () => void;
  isCancelRunPending?: boolean;
  isCancelJourneyRunsPending?: boolean;
}

export function WorkflowRunDetail({
  run,
  runDetail,
  isLoadingDetail,
  canManageWorkflow,
  selectedNodeId,
  onSelectNode,
  onBack,
  onCancelRun,
  onCancelJourneyRuns,
  isCancelRunPending = false,
  isCancelJourneyRunsPending = false,
}: WorkflowRunDetailProps) {
  const [showTechnical, setShowTechnical] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const runStatus = runDetail?.run.status ?? run.status;
  const canCancel = canManageWorkflow && isRunActive(runStatus);

  const stepLabelByStepKey = useMemo(
    () => (runDetail ? getStepLabelByStepKey(runDetail) : {}),
    [runDetail],
  );

  const nodeTypeByStepKey = useMemo(
    () => (runDetail ? getNodeTypeByStepKey(runDetail) : {}),
    [runDetail],
  );

  const testSafetySummary = useMemo(
    () =>
      runDetail && run.mode === "test"
        ? summarizeTestSafetyOutcomes(runDetail.deliveries)
        : null,
    [runDetail, run.mode],
  );

  const stepCount =
    runDetail && runDetail.stepLogs.length > 0
      ? runDetail.stepLogs.length
      : runDetail
        ? runDetail.deliveries.length
        : 0;

  const runEvents = runDetail?.events ?? [];

  return (
    <section className="flex h-full flex-col">
      {/* Header */}
      <div className="space-y-1 border-b px-3 py-3">
        <div className="flex items-start gap-2">
          <Button
            className="mt-0.5 shrink-0"
            onClick={onBack}
            size="icon-sm"
            variant="ghost"
          >
            <Icon icon={ArrowLeft02Icon} className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium text-sm">
                Run for {run.journeyNameSnapshot}
              </p>
              {run.journeyVersion ? (
                <Badge variant="outline" className="shrink-0">
                  V{run.journeyVersion}
                </Badge>
              ) : null}
              <span className="flex items-center gap-1.5 shrink-0 text-xs">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    getRunStatusDotColorClass(runStatus),
                  )}
                />
                {toRunStatusLabel(runStatus)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDisplayDateTime(run.startedAt)}
              {" \u2022 "}
              <span className="capitalize">{run.mode}</span>
              {run.journeyDeleted ? " \u2022 Deleted journey" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {isLoadingDetail ? (
          <p className="text-muted-foreground text-xs">Loading timeline...</p>
        ) : null}

        {/* Test mode banner */}
        {runDetail && run.mode === "test" ? (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs">
            <span className="font-medium">
              Test mode — external sends blocked
            </span>
            {testSafetySummary ? (
              <span className="text-muted-foreground">
                Routed: {testSafetySummary.routedCount} • Log-only:{" "}
                {testSafetySummary.logOnlyCount} • Fallback:{" "}
                {testSafetySummary.fallbackCount}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Timeline */}
        {runDetail ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                Timeline
              </p>
              <p className="text-muted-foreground text-[11px]">
                {stepCount} {stepCount === 1 ? "step" : "steps"}
              </p>
            </div>

            <WorkflowRunTimeline
              runDetail={runDetail}
              stepLabelByStepKey={stepLabelByStepKey}
              nodeTypeByStepKey={nodeTypeByStepKey}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              nowMs={nowMs}
            />
          </div>
        ) : null}

        {/* Cancel actions */}
        {canCancel ? (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                !onCancelRun || isCancelRunPending || isCancelJourneyRunsPending
              }
              onClick={() => onCancelRun?.(run.id)}
              size="sm"
              variant="destructive"
            >
              {isCancelRunPending ? "Canceling run..." : "Cancel this run"}
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

        {/* Technical details toggle */}
        {runDetail &&
        (runEvents.length > 0 || runDetail.stepLogs.length > 0) ? (
          <div className="space-y-3">
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowTechnical((prev) => !prev)}
              type="button"
            >
              {showTechnical
                ? "Hide technical details"
                : "Show technical details"}
            </button>

            {showTechnical ? (
              <div className="space-y-3">
                {/* Run events */}
                {runEvents.length > 0 ? (
                  <div className="space-y-2 rounded-md border bg-muted/15 p-2">
                    <p className="font-medium text-xs uppercase tracking-wide">
                      Run events
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
          </div>
        ) : null}
      </div>
    </section>
  );
}
