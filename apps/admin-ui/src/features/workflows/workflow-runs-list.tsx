import { useMemo, useState } from "react";
import type { JourneyRun } from "@scheduling/dto";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import {
  getRunStatusDotColorClass,
  toRunStatusLabel,
} from "./workflow-runs-helpers";

type RunModeFilter = "all" | "live" | "test";

interface WorkflowRunsListProps {
  runs: JourneyRun[];
  isLoading: boolean;
  onSelectRun: (runId: string) => void;
  onRefresh: () => void;
}

export function WorkflowRunsList({
  runs,
  isLoading,
  onSelectRun,
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
    <section className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <h2 className="font-medium text-sm">Runs</h2>
        <Button onClick={onRefresh} size="sm" variant="outline">
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-1.5 px-3 pb-3">
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredRuns.length === 0 ? (
          <p className="px-3 text-muted-foreground text-sm">No runs yet.</p>
        ) : (
          <div>
            {filteredRuns.map((run) => (
              <button
                className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                key={run.id}
                onClick={() => onSelectRun(run.id)}
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
                      {run.journeyNameSnapshot}
                    </p>
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {formatRelativeTime(run.startedAt)}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {run.mode}
                    {run.journeyVersion ? ` • v${run.journeyVersion}` : ""}
                    {run.journeyDeleted ? " • deleted" : ""}
                    {" • "}
                    {toRunStatusLabel(run.status).toLowerCase()}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
