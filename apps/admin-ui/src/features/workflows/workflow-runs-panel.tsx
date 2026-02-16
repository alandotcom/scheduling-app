import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDisplayDateTime } from "@/lib/date-utils";
import { orpc } from "@/lib/query";
import {
  selectedExecutionIdAtom,
  workflowEditorEdgesAtom,
  workflowEditorNodesAtom,
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

function toNodeLogStatus(
  status: unknown,
): "pending" | "running" | "success" | "error" | "cancelled" {
  switch (status) {
    case "pending":
    case "running":
    case "success":
    case "error":
    case "cancelled":
      return status;
    default:
      return "pending";
  }
}

function toNodeLabel(value: unknown, fallbackNodeId: string): string {
  const record = asRecord(value);
  if (!record) {
    return fallbackNodeId;
  }

  const label = record["label"];
  return typeof label === "string" && label.trim().length > 0
    ? label.trim()
    : fallbackNodeId;
}

function buildTopologicalNodeOrder(input: {
  nodes: Array<{
    id: string;
    data?: unknown;
    position?: { x: number; y: number };
  }>;
  edges: Array<{ source: string; target: string }>;
}): string[] {
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  for (const node of input.nodes) {
    adjacency.set(node.id, new Set());
    indegree.set(node.id, 0);
  }

  for (const edge of input.edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) {
      continue;
    }

    const targets = adjacency.get(edge.source);
    if (!targets || targets.has(edge.target)) {
      continue;
    }

    targets.add(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const compareNodeIds = (leftId: string, rightId: string) => {
    const left = nodeById.get(leftId);
    const right = nodeById.get(rightId);
    const leftY = left?.position?.y ?? 0;
    const rightY = right?.position?.y ?? 0;
    if (leftY !== rightY) {
      return leftY - rightY;
    }

    const leftX = left?.position?.x ?? 0;
    const rightX = right?.position?.x ?? 0;
    if (leftX !== rightX) {
      return leftX - rightX;
    }

    return leftId.localeCompare(rightId);
  };

  const queue = [...nodeById.keys()]
    .filter((nodeId) => (indegree.get(nodeId) ?? 0) === 0)
    .toSorted(compareNodeIds);

  const ordered: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) {
      break;
    }

    ordered.push(nodeId);

    for (const targetId of adjacency.get(nodeId) ?? []) {
      const next = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, next);

      if (next === 0) {
        queue.push(targetId);
        queue.sort(compareNodeIds);
      }
    }
  }

  const unvisited = [...nodeById.keys()]
    .filter((nodeId) => !ordered.includes(nodeId))
    .toSorted(compareNodeIds);

  return [...ordered, ...unvisited];
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
  const editorNodes = useAtomValue(workflowEditorNodesAtom);
  const editorEdges = useAtomValue(workflowEditorEdgesAtom);
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

  const nodeNameById = useMemo(() => {
    const map = new Map<string, string>();

    for (const node of editorNodes) {
      if (!map.has(node.id)) {
        map.set(node.id, toNodeLabel(node.data, node.id));
      }
    }

    for (const log of orderedExecutionLogs) {
      if (!map.has(log.nodeId)) {
        map.set(log.nodeId, log.nodeName);
      }
    }

    return map;
  }, [editorNodes, orderedExecutionLogs]);

  const graphNodeOrderIndex = useMemo(() => {
    const orderedNodeIds = buildTopologicalNodeOrder({
      nodes: editorNodes.map((node) => ({
        id: node.id,
        data: node.data,
        position: node.position,
      })),
      edges: editorEdges.map((edge) => ({
        source: edge.source,
        target: edge.target,
      })),
    });

    return new Map(orderedNodeIds.map((nodeId, index) => [nodeId, index]));
  }, [editorEdges, editorNodes]);

  const orderedNodeStatuses = useMemo(() => {
    const nodeStatuses = executionStatusQuery.data?.nodeStatuses ?? [];

    return [...nodeStatuses]
      .map((nodeStatus) => ({
        nodeId: nodeStatus.nodeId,
        status: toNodeLogStatus(nodeStatus.status),
      }))
      .toSorted((left, right) => {
        const leftOrder = graphNodeOrderIndex.get(left.nodeId);
        const rightOrder = graphNodeOrderIndex.get(right.nodeId);

        if (leftOrder !== undefined && rightOrder !== undefined) {
          return leftOrder - rightOrder;
        }

        if (leftOrder !== undefined) {
          return -1;
        }

        if (rightOrder !== undefined) {
          return 1;
        }

        return left.nodeId.localeCompare(right.nodeId);
      });
  }, [executionStatusQuery.data?.nodeStatuses, graphNodeOrderIndex]);

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

    const statusEntries = executionStatusQuery.data?.nodeStatuses ?? [];
    const logs = executionLogsQuery.data?.logs;
    if (!statusEntries.length && !logs?.length) {
      setExecutionLogsByNodeId({});
      return;
    }

    const executionStatus =
      executionStatusQuery.data?.status ?? selectedExecution?.status;

    const latestByNode = statusEntries.reduce<
      Record<
        string,
        {
          nodeId: string;
          status: "pending" | "running" | "success" | "error" | "cancelled";
          input?: unknown;
          startedAt?: string | Date;
        }
      >
    >((acc, statusEntry) => {
      const normalizedStatus = toNodeLogStatus(statusEntry.status);
      const status =
        executionStatus === "cancelled" &&
        (normalizedStatus === "pending" || normalizedStatus === "running")
          ? "cancelled"
          : normalizedStatus;

      acc[statusEntry.nodeId] = {
        nodeId: statusEntry.nodeId,
        status,
      };

      return acc;
    }, {});

    if (logs?.length) {
      for (const log of [...logs].toSorted((left, right) => {
        const delta =
          toTimestamp(right.startedAt) - toTimestamp(left.startedAt);
        if (delta !== 0) {
          return delta;
        }

        return right.id.localeCompare(left.id);
      })) {
        const entry = latestByNode[log.nodeId];
        const logStatus =
          executionStatus === "cancelled" &&
          (log.status === "pending" || log.status === "running")
            ? "cancelled"
            : log.status;

        if (!entry) {
          latestByNode[log.nodeId] = {
            nodeId: log.nodeId,
            status: logStatus,
            input: log.input,
            startedAt: log.startedAt,
          };
          continue;
        }

        latestByNode[log.nodeId] = {
          ...entry,
          status: toNodeLogStatus(logStatus),
          ...(entry.input === undefined ? { input: log.input } : {}),
          ...(entry.startedAt === undefined
            ? { startedAt: log.startedAt }
            : {}),
        };
      }
    }

    setExecutionLogsByNodeId(latestByNode);
  }, [
    executionStatusQuery.data?.nodeStatuses,
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

      {executionsQuery.data?.length ? (
        <div className="space-y-2">
          {executionsQuery.data.map((execution, index) => {
            const isSelected = selectedExecutionId === execution.id;
            const runNumber = executionsQuery.data.length - index;
            const statusLabel =
              isSelected && executionStatusQuery.data?.status
                ? executionStatusQuery.data.status
                : execution.status;

            return (
              <article
                className={
                  isSelected
                    ? "rounded-md border border-primary bg-background"
                    : "rounded-md border bg-background"
                }
                key={execution.id}
              >
                <button
                  className="w-full rounded-md p-3 text-left hover:bg-muted/30"
                  onClick={() =>
                    setSelectedExecutionId((current) =>
                      current === execution.id ? null : execution.id,
                    )
                  }
                  type="button"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">
                      Run #{runNumber}
                    </span>
                    <Badge variant={toStatusBadgeVariant(statusLabel)}>
                      {statusLabel}
                    </Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground text-xs">
                    Started {formatDisplayDateTime(execution.startedAt)}
                    {execution.triggerEventType
                      ? ` • ${execution.triggerEventType}`
                      : ""}
                  </p>
                </button>

                {isSelected ? (
                  <div className="space-y-3 border-t px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-muted-foreground text-xs">
                        {execution.id}
                      </p>
                      {canManageWorkflow && statusLabel === "waiting" ? (
                        <Button
                          disabled={cancelMutation.isPending}
                          onClick={() => {
                            cancelMutation.mutate({
                              executionId: execution.id,
                            });
                          }}
                          size="sm"
                          variant="outline"
                        >
                          Cancel run
                        </Button>
                      ) : null}
                    </div>

                    <div className="space-y-2 rounded-md bg-muted/40 p-2 text-xs">
                      <p>
                        Current status: <strong>{statusLabel}</strong>
                      </p>

                      {orderedNodeStatuses.length ? (
                        <div className="space-y-1">
                          <p className="font-medium text-[11px]">
                            Node execution status
                          </p>
                          {orderedNodeStatuses.map((nodeStatus) => {
                            const nodeLabel =
                              nodeNameById.get(nodeStatus.nodeId) ??
                              nodeStatus.nodeId;

                            return (
                              <div
                                className="flex items-center justify-between rounded border bg-background px-2 py-1"
                                key={nodeStatus.nodeId}
                              >
                                <span className="truncate pr-2 text-[11px]">
                                  {nodeLabel}
                                </span>
                                <Badge
                                  variant={toStatusBadgeVariant(
                                    nodeStatus.status,
                                  )}
                                >
                                  {nodeStatus.status}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-[11px]">
                          {statusLabel === "running" ||
                          statusLabel === "waiting"
                            ? "Run is in progress. Waiting for node updates..."
                            : "No node status updates yet."}
                        </p>
                      )}
                    </div>

                    {orderedExecutionEvents.length ||
                    orderedExecutionLogs.length ? (
                      <details className="rounded border p-2 text-xs">
                        <summary className="cursor-pointer font-medium">
                          Debug details
                        </summary>

                        <div className="mt-2 space-y-2">
                          {orderedExecutionEvents.length ? (
                            <div className="space-y-1">
                              <p className="font-medium text-xs">Events</p>
                              {orderedExecutionEvents.map((event) => {
                                const eventNodeName = toEventNodeName(
                                  event.metadata,
                                );

                                return (
                                  <div
                                    className="rounded border px-2 py-1 text-xs"
                                    key={event.id}
                                  >
                                    <p className="font-medium">
                                      {event.message}
                                    </p>
                                    {eventNodeName ? (
                                      <p className="text-muted-foreground text-[11px]">
                                        Node: {eventNodeName}
                                      </p>
                                    ) : null}
                                    <p className="text-muted-foreground">
                                      {event.eventType}
                                    </p>
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
                                    <p className="mt-2 text-destructive text-xs">
                                      {log.error}
                                    </p>
                                  ) : null}
                                </details>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </details>
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
          Read-only mode: run cancellation is available to admins only.
        </p>
      ) : null}
    </section>
  );
}
