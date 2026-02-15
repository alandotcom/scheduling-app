import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

function summarizeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Unable to format value";
  }
}

function toStatusBadgeVariant(status: string): "default" | "destructive" {
  return status === "error" ? "destructive" : "default";
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

  const executionsQuery = useQuery({
    ...orpc.workflows.executions.list.queryOptions({
      input: {
        id: workflowId ?? "00000000-0000-0000-0000-000000000000",
        limit: 20,
      },
    }),
    enabled: Boolean(workflowId),
  });

  const executionLogsQuery = useQuery({
    ...orpc.workflows.executions.logs.queryOptions({
      input: {
        executionId:
          selectedExecutionId ?? "00000000-0000-0000-0000-000000000000",
      },
    }),
    enabled: Boolean(selectedExecutionId),
  });

  const executionEventsQuery = useQuery({
    ...orpc.workflows.executions.events.queryOptions({
      input: {
        executionId:
          selectedExecutionId ?? "00000000-0000-0000-0000-000000000000",
      },
    }),
    enabled: Boolean(selectedExecutionId),
  });

  const executionStatusQuery = useQuery({
    ...orpc.workflows.executions.status.queryOptions({
      input: {
        executionId:
          selectedExecutionId ?? "00000000-0000-0000-0000-000000000000",
      },
    }),
    enabled: Boolean(selectedExecutionId),
    refetchInterval: (query) => {
      if (query.state.data?.status === "running") {
        return 2000;
      }

      return false;
    },
  });

  const cancelMutation = useMutation(
    orpc.workflows.executions.cancel.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.workflows.executions.list.key(),
        });
        await queryClient.invalidateQueries({
          queryKey: orpc.workflows.executions.logs.key(),
        });
      },
    }),
  );

  const selectedExecution = useMemo(
    () =>
      executionsQuery.data?.find(
        (execution) => execution.id === selectedExecutionId,
      ) ?? null,
    [executionsQuery.data, selectedExecutionId],
  );

  useEffect(() => {
    if (!selectedExecutionId) {
      setExecutionLogsByNodeId({});
      return;
    }

    const logs = executionLogsQuery.data?.logs;
    if (!logs?.length) {
      setExecutionLogsByNodeId({});
      return;
    }

    const latestByNode = logs.reduce<
      Record<
        string,
        {
          nodeId: string;
          status: "pending" | "running" | "success" | "error" | "cancelled";
          input?: unknown;
          startedAt?: string | Date;
        }
      >
    >((acc, log) => {
      if (!acc[log.nodeId]) {
        acc[log.nodeId] = {
          nodeId: log.nodeId,
          status: log.status,
          input: log.input,
          startedAt: log.startedAt,
        };
      }

      return acc;
    }, {});

    setExecutionLogsByNodeId(latestByNode);
  }, [
    executionLogsQuery.data?.logs,
    selectedExecutionId,
    setExecutionLogsByNodeId,
  ]);

  if (!workflowId) {
    return (
      <p className="text-muted-foreground text-sm">
        Save the workflow before viewing run history.
      </p>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium text-sm">Runs</h2>
        <Button
          onClick={() => {
            queryClient.invalidateQueries({
              queryKey: orpc.workflows.executions.list.key(),
            });
          }}
          size="sm"
          variant="outline"
        >
          Refresh
        </Button>
      </div>

      {executionsQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading runs...</p>
      ) : null}

      {executionsQuery.data?.length === 0 ? (
        <p className="text-muted-foreground text-sm">No runs yet.</p>
      ) : null}

      {executionsQuery.data?.length ? (
        <div className="space-y-2">
          {executionsQuery.data.map((execution) => (
            <button
              className="w-full rounded-md border p-3 text-left hover:bg-muted/30"
              key={execution.id}
              onClick={() => setSelectedExecutionId(execution.id)}
              type="button"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{execution.id}</span>
                <Badge variant={toStatusBadgeVariant(execution.status)}>
                  {execution.status}
                </Badge>
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                Started {formatDisplayDateTime(execution.startedAt)}
              </p>
            </button>
          ))}
        </div>
      ) : null}

      {selectedExecution ? (
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium text-sm">Execution details</p>
              <p className="text-muted-foreground text-xs">
                {selectedExecution.id}
              </p>
            </div>
            {canManageWorkflow && selectedExecution.status === "waiting" ? (
              <Button
                disabled={cancelMutation.isPending}
                onClick={() => {
                  cancelMutation.mutate({ executionId: selectedExecution.id });
                }}
                size="sm"
                variant="outline"
              >
                Cancel run
              </Button>
            ) : null}
          </div>

          {executionStatusQuery.data ? (
            <div className="rounded-md bg-muted/40 p-2 text-xs">
              <p>
                Current status:{" "}
                <strong>{executionStatusQuery.data.status}</strong>
              </p>
              <p>
                Node statuses: {executionStatusQuery.data.nodeStatuses.length}
              </p>
            </div>
          ) : null}

          {executionEventsQuery.data?.events?.length ? (
            <div className="space-y-1">
              <p className="font-medium text-xs">Events</p>
              {executionEventsQuery.data.events.map((event) => (
                <div
                  className="rounded border px-2 py-1 text-xs"
                  key={event.id}
                >
                  <p className="font-medium">{event.message}</p>
                  <p className="text-muted-foreground">{event.eventType}</p>
                </div>
              ))}
            </div>
          ) : null}

          {executionLogsQuery.data?.logs?.length ? (
            <div className="space-y-1">
              <p className="font-medium text-xs">Logs</p>
              {executionLogsQuery.data.logs.map((log) => (
                <details
                  className="rounded border px-2 py-1 text-xs"
                  key={log.id}
                >
                  <summary className="cursor-pointer font-medium">
                    {log.nodeName} ({log.status})
                  </summary>
                  {log.input !== undefined ? (
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap text-[11px]">
                      {summarizeJson(log.input)}
                    </pre>
                  ) : null}
                  {log.output !== undefined ? (
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap text-[11px]">
                      {summarizeJson(log.output)}
                    </pre>
                  ) : null}
                  {log.error ? (
                    <p className="mt-2 text-destructive text-xs">{log.error}</p>
                  ) : null}
                </details>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!canManageWorkflow ? (
        <p className="text-muted-foreground text-xs">
          Read-only mode: run cancellation is available to admins only.
        </p>
      ) : null}
    </section>
  );
}
