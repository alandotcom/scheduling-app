import { useMemo, useState } from "react";
import type { JourneyRun, JourneyRunListItem } from "@scheduling/dto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDisplayDateTime, formatRelativeTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import {
  getRunStatusDotColorClass,
  toEventTypeLabel,
  toRunStatusBadgeVariant,
  toRunStatusLabel,
} from "./workflow-runs-helpers";

type RunModeFilter = "all" | "live" | "test";
type WorkflowRunListRow = JourneyRun & {
  sidebarSummary?: JourneyRunListItem["sidebarSummary"];
};

interface WorkflowRunsListProps {
  runs: WorkflowRunListRow[];
  isLoading: boolean;
  selectedRunId?: string | null;
  onSelectRun: (runId: string) => void;
  onRunRowRef?: (runId: string, element: HTMLButtonElement | null) => void;
  onRefresh: () => void;
}

function toChannelChipLabel(channel: string | null): string | null {
  if (!channel) {
    return null;
  }

  const normalized = channel.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  if (normalized === "sms") {
    return "SMS";
  }

  return normalized
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function WorkflowRunsList({
  runs,
  isLoading,
  selectedRunId = null,
  onSelectRun,
  onRunRowRef,
  onRefresh,
}: WorkflowRunsListProps) {
  const [modeFilter, setModeFilter] = useState<RunModeFilter>("all");

  const filteredRuns = useMemo(() => {
    if (modeFilter === "all") {
      return runs;
    }

    return runs.filter((run) => run.mode === modeFilter);
  }, [modeFilter, runs]);

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading runs...</p>;
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="sticky top-0 z-10 border-b bg-card px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium text-sm">Runs</h2>
            <Button onClick={onRefresh} size="sm" variant="outline">
              Refresh
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {(["all", "live", "test"] as const).map((mode) => (
              <Button
                key={mode}
                onClick={() => setModeFilter(mode)}
                size="sm"
                variant={modeFilter === mode ? "default" : "outline"}
              >
                {mode === "all" ? "All" : mode === "live" ? "Live" : "Test"}
              </Button>
            ))}
          </div>
        </div>

        {filteredRuns.length === 0 ? (
          <p className="px-3 py-3 text-muted-foreground text-sm">
            No runs yet.
          </p>
        ) : (
          <div>
            {filteredRuns.map((run) => (
              <button
                className={cn(
                  "relative flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-inset",
                  selectedRunId === run.id &&
                    "bg-muted/35 ring-1 ring-inset ring-border/70",
                )}
                key={run.id}
                onClick={() => onSelectRun(run.id)}
                ref={(element) => onRunRowRef?.(run.id, element)}
                aria-current={selectedRunId === run.id ? "true" : undefined}
                type="button"
              >
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    getRunStatusDotColorClass(run.status),
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium text-sm">
                      {run.sidebarSummary?.subject.primary ??
                        run.journeyNameSnapshot}
                    </p>
                    <span
                      className="shrink-0 text-muted-foreground text-xs"
                      title={formatDisplayDateTime(run.startedAt)}
                    >
                      {formatRelativeTime(run.startedAt)}
                    </span>
                  </div>
                  {run.sidebarSummary?.subject.secondary ? (
                    <p className="truncate text-muted-foreground text-xs">
                      {run.sidebarSummary.subject.secondary}
                    </p>
                  ) : null}
                  <p className="truncate text-muted-foreground text-xs">
                    {toEventTypeLabel(
                      run.sidebarSummary?.triggerEventType ?? null,
                    )}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant={toRunStatusBadgeVariant(run.status)}>
                      {toRunStatusLabel(run.status)}
                    </Badge>
                    <Badge variant="outline">
                      {run.mode === "live" ? "Live" : "Test"}
                    </Badge>
                    {run.journeyVersion ? (
                      <Badge variant="outline">v{run.journeyVersion}</Badge>
                    ) : null}
                    {run.sidebarSummary?.channelHint ? (
                      <Badge variant="outline">
                        {toChannelChipLabel(run.sidebarSummary.channelHint) ??
                          run.sidebarSummary.channelHint}
                      </Badge>
                    ) : null}
                    {run.journeyDeleted ? (
                      <Badge variant="secondary">Deleted</Badge>
                    ) : null}
                  </div>
                  {run.sidebarSummary?.nextState ? (
                    <p className="truncate text-muted-foreground text-xs">
                      {run.sidebarSummary.nextState.label}
                      {run.sidebarSummary.nextState.at
                        ? ` ${formatDisplayDateTime(run.sidebarSummary.nextState.at)}`
                        : ""}
                    </p>
                  ) : run.sidebarSummary?.statusReason ? (
                    <p className="truncate text-muted-foreground text-xs">
                      {run.sidebarSummary.statusReason}
                    </p>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
