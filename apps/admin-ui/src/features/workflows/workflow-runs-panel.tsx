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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    record[key] = entry;
  }

  return record;
}

function toTimestamp(value: string | Date | null | undefined): number {
  if (!value) {
    return 0;
  }

  return new Date(value).getTime();
}

function toEventNodeName(metadata: unknown): string | null {
  const metadataRecord = asRecord(metadata);
  if (!metadataRecord) {
    return null;
  }

  const nodeName = metadataRecord["nodeName"];
  return typeof nodeName === "string" && nodeName.trim().length > 0
    ? nodeName.trim()
    : null;
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
    refetchInterval: (query) => {
      const hasActiveRuns =
        query.state.data?.some(
          (execution) =>
            execution.status === "running" || execution.status === "waiting",
        ) ?? false;

      return hasActiveRuns ? 2000 : false;
    },
  });

  const executionLogsQuery = useQuery({
    ...orpc.workflows.executions.logs.queryOptions({
      input: {
        executionId:
          selectedExecutionId ?? "00000000-0000-0000-0000-000000000000",
      },
    }),
    enabled: Boolean(selectedExecutionId),
    refetchInterval: 2000,
  });

  const executionEventsQuery = useQuery({
    ...orpc.workflows.executions.events.queryOptions({
      input: {
        executionId:
          selectedExecutionId ?? "00000000-0000-0000-0000-000000000000",
      },
    }),
    enabled: Boolean(selectedExecutionId),
    refetchInterval: 2000,
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
      if (
        query.state.data?.status === "running" ||
        query.state.data?.status === "waiting"
      ) {
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

  const otherExecutions = useMemo(
    () =>
      executionsQuery.data?.filter(
        (execution) => execution.id !== selectedExecutionId,
      ) ?? [],
    [executionsQuery.data, selectedExecutionId],
  );

  const orderedExecutionEvents = useMemo(() => {
    const events = executionEventsQuery.data?.events ?? [];

    return [...events].toSorted((left, right) => {
      const delta = toTimestamp(left.createdAt) - toTimestamp(right.createdAt);
      if (delta !== 0) {
        return delta;
      }

      return left.id.localeCompare(right.id);
    });
  }, [executionEventsQuery.data?.events]);

  const orderedExecutionLogs = useMemo(() => {
    const logs = executionLogsQuery.data?.logs ?? [];

    return [...logs].toSorted((left, right) => {
      const delta = toTimestamp(left.startedAt) - toTimestamp(right.startedAt);
      if (delta !== 0) {
        return delta;
      }

      return left.id.localeCompare(right.id);
    });
  }, [executionLogsQuery.data?.logs]);

  useEffect(
    () => () => {
      setSelectedExecutionId(null);
      setExecutionLogsByNodeId({});
    },
    [setExecutionLogsByNodeId, setSelectedExecutionId],
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

    const executionStatus =
      executionStatusQuery.data?.status ?? selectedExecution?.status;

    const latestByNode = [...logs]
      .toSorted((left, right) => {
        const delta =
          toTimestamp(right.startedAt) - toTimestamp(left.startedAt);
        if (delta !== 0) {
          return delta;
        }

        return right.id.localeCompare(left.id);
      })
      .reduce<
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
          const status =
            executionStatus === "cancelled" &&
            (log.status === "pending" || log.status === "running")
              ? "cancelled"
              : log.status;

          acc[log.nodeId] = {
            nodeId: log.nodeId,
            status,
            input: log.input,
            startedAt: log.startedAt,
          };
        }

        return acc;
      }, {});

    setExecutionLogsByNodeId(latestByNode);
  }, [
    executionLogsQuery.data?.logs,
    executionStatusQuery.data?.status,
    selectedExecution?.status,
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
        <div className="flex items-center gap-2">
          {selectedExecutionId ? (
            <Button
              onClick={() => setSelectedExecutionId(null)}
              size="sm"
              variant="ghost"
            >
              Clear
            </Button>
          ) : null}
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
      </div>

      {executionsQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading runs...</p>
      ) : null}

      {executionsQuery.data?.length === 0 ? (
        <p className="text-muted-foreground text-sm">No runs yet.</p>
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
            <div className="flex items-center gap-2">
              <Badge variant={toStatusBadgeVariant(selectedExecution.status)}>
                {selectedExecution.status}
              </Badge>
              {canManageWorkflow && selectedExecution.status === "waiting" ? (
                <Button
                  disabled={cancelMutation.isPending}
                  onClick={() => {
                    cancelMutation.mutate({
                      executionId: selectedExecution.id,
                    });
                  }}
                  size="sm"
                  variant="outline"
                >
                  Cancel run
                </Button>
              ) : null}
            </div>
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

          {orderedExecutionEvents.length ? (
            <div className="space-y-1">
              <p className="font-medium text-xs">Events</p>
              {orderedExecutionEvents.map((event) => {
                const eventNodeName = toEventNodeName(event.metadata);

                return (
                  <div
                    className="rounded border px-2 py-1 text-xs"
                    key={event.id}
                  >
                    <p className="font-medium">{event.message}</p>
                    {eventNodeName ? (
                      <p className="text-muted-foreground text-[11px]">
                        Node: {eventNodeName}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground">{event.eventType}</p>
                  </div>
                );
              })}
            </div>
          ) : null}

          {orderedExecutionLogs.length ? (
            <div className="space-y-1">
              <p className="font-medium text-xs">Logs</p>
              {orderedExecutionLogs.map((log) => (
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

      {otherExecutions.length ? (
        <div className="space-y-2">
          {otherExecutions.map((execution) => (
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

      {!canManageWorkflow ? (
        <p className="text-muted-foreground text-xs">
          Read-only mode: run cancellation is available to admins only.
        </p>
      ) : null}
    </section>
  );
}
