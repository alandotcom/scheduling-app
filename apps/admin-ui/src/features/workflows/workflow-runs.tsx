import type {
  WorkflowRunSummary,
  WorkflowStepLogEntry,
  WorkflowStepLogStatus,
} from "@scheduling/dto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDateTime,
  formatDuration,
  toRunStatusBadgeVariant,
  toStepStatusBadgeVariant,
} from "./workflow-editor-utils";

type WorkflowRunsProps = {
  runs: WorkflowRunSummary[];
  selectedRunId: string | null;
  stepLogs: WorkflowStepLogEntry[];
  isRunsLoading: boolean;
  isStepLogsLoading: boolean;
  onSelectRun: (runId: string) => void;
  onCancelRun: () => void;
  isCancelingRun: boolean;
};

function statusLabel(status: WorkflowStepLogStatus): string {
  return status.replaceAll("_", " ");
}

export function WorkflowRuns({
  runs,
  selectedRunId,
  stepLogs,
  isRunsLoading,
  isStepLogsLoading,
  onSelectRun,
  onCancelRun,
  isCancelingRun,
}: WorkflowRunsProps) {
  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-2">
      <Card className="min-h-0">
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Runs</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 overflow-y-auto space-y-2">
          {isRunsLoading ? (
            <p className="text-sm text-muted-foreground">Loading runs...</p>
          ) : null}
          {!isRunsLoading && runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : null}
          {runs.map((run) => (
            <button
              key={run.runId}
              className="w-full rounded-md border p-2 text-left hover:bg-muted/50"
              onClick={() => onSelectRun(run.runId)}
              type="button"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{run.runId}</p>
                <Badge variant={toRunStatusBadgeVariant(run.status)}>
                  {run.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {run.entityType} · {run.entityId}
              </p>
              <p className="text-xs text-muted-foreground">
                Started {formatDateTime(run.startedAt)}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="min-h-0">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">Step logs</CardTitle>
            <Button
              disabled={selectedRunId === null || isCancelingRun}
              onClick={onCancelRun}
              size="sm"
              variant="outline"
            >
              {isCancelingRun ? "Cancelling..." : "Cancel run"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 overflow-y-auto space-y-2">
          {selectedRunId === null ? (
            <p className="text-sm text-muted-foreground">
              Select a run to inspect step logs.
            </p>
          ) : null}
          {selectedRunId !== null && isStepLogsLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading step logs...
            </p>
          ) : null}
          {selectedRunId !== null &&
          !isStepLogsLoading &&
          stepLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No step logs for this run yet.
            </p>
          ) : null}
          {stepLogs.map((log) => (
            <div key={log.id} className="rounded-md border p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{log.nodeName}</p>
                <Badge variant={toStepStatusBadgeVariant(log.status)}>
                  {statusLabel(log.status)}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {log.nodeType} · {formatDuration(log.durationMs)}
              </p>
              {log.errorMessage ? (
                <p className="mt-1 text-xs text-destructive">
                  {log.errorMessage}
                </p>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
