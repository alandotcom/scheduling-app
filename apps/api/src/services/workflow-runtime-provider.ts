import type {
  WorkflowExecution,
  WorkflowExecutionEvent,
  WorkflowExecutionLog,
} from "../repositories/workflows.js";
import {
  inngestRunsClient,
  toSyntheticUuid,
  type InngestFunctionRun,
  type InngestRunTrace,
  type InngestRunTraceSpan,
} from "./inngest-runs.js";

type WorkflowExecutionStatus = WorkflowExecution["status"];
type WorkflowExecutionLogStatus = WorkflowExecutionLog["status"];

export type WorkflowExecutionNodeStatus = {
  nodeId: string;
  status: WorkflowExecutionLogStatus;
};

export interface WorkflowRuntimeProvider {
  resolveRunIdFromEvent(eventId: string): Promise<string | null>;
  hydrateExecution(execution: WorkflowExecution): Promise<WorkflowExecution>;
  listExecutionLogs(
    execution: WorkflowExecution,
  ): Promise<WorkflowExecutionLog[]>;
  listExecutionEvents(
    execution: WorkflowExecution,
  ): Promise<WorkflowExecutionEvent[]>;
  getExecutionStatus(execution: WorkflowExecution): Promise<{
    status: WorkflowExecutionStatus;
    nodeStatuses: WorkflowExecutionNodeStatus[];
  }>;
  cancelExecution(runId: string): Promise<void>;
}

function mapInngestRunStatus(status: string): WorkflowExecutionStatus {
  switch (status.toUpperCase()) {
    case "QUEUED":
      return "pending";
    case "RUNNING":
      return "running";
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "error";
    case "CANCELLED":
    case "SKIPPED":
      return "cancelled";
    case "WAITING":
      return "waiting";
    default:
      return "running";
  }
}

function mapInngestSpanStatus(status: string): WorkflowExecutionLogStatus {
  switch (status.toUpperCase()) {
    case "QUEUED":
      return "pending";
    case "RUNNING":
    case "WAITING":
      return "running";
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "error";
    case "CANCELLED":
    case "SKIPPED":
      return "cancelled";
    default:
      return "running";
  }
}

function hasWaitingSpan(span: InngestRunTraceSpan | undefined): boolean {
  if (!span) {
    return false;
  }

  if (span.status.toUpperCase() === "WAITING") {
    return true;
  }

  return span.childrenSpans.some((child) => hasWaitingSpan(child));
}

function flattenTraceSpans(
  root: InngestRunTraceSpan | undefined,
): InngestRunTraceSpan[] {
  if (!root) {
    return [];
  }

  const spans: InngestRunTraceSpan[] = [root];
  for (const child of root.childrenSpans) {
    spans.push(...flattenTraceSpans(child));
  }

  return spans;
}

function mapExecutionFromInngest(input: {
  execution: WorkflowExecution;
  run: InngestFunctionRun | null;
  trace: InngestRunTrace | null;
}): WorkflowExecution {
  if (!input.run) {
    return input.execution;
  }

  const mappedStatus = mapInngestRunStatus(input.run.status);
  const status: WorkflowExecutionStatus =
    mappedStatus === "running" && hasWaitingSpan(input.trace?.trace)
      ? "waiting"
      : mappedStatus;

  return {
    ...input.execution,
    status,
    output: input.run.output,
    error:
      status === "error"
        ? typeof input.run.output === "string"
          ? input.run.output
          : input.execution.error
        : input.execution.error,
    startedAt: input.run.startedAt ?? input.execution.startedAt,
    completedAt: input.run.finishedAt,
    waitingAt:
      status === "waiting"
        ? (input.run.startedAt ??
          input.execution.waitingAt ??
          input.execution.startedAt)
        : null,
    cancelledAt:
      status === "cancelled"
        ? input.run.finishedAt
        : input.execution.cancelledAt,
    duration:
      input.run.startedAt && input.run.finishedAt
        ? String(input.run.finishedAt.getTime() - input.run.startedAt.getTime())
        : input.execution.duration,
  };
}

function mapExecutionLogsFromTrace(input: {
  execution: WorkflowExecution;
  trace: InngestRunTrace | null;
}): WorkflowExecutionLog[] {
  const spans = flattenTraceSpans(input.trace?.trace).filter(
    (span) => typeof span.stepId === "string" && span.stepId.length > 0,
  );

  return spans
    .map((span) => {
      const startedAt = span.startedAt ?? input.execution.startedAt;
      const completedAt = span.endedAt;

      return {
        id: toSyntheticUuid(
          `execution-log:${input.execution.id}:${span.spanId}:${span.stepId ?? span.name}`,
        ),
        orgId: input.execution.orgId,
        executionId: input.execution.id,
        nodeId: span.stepId ?? span.spanId,
        nodeName: span.name,
        nodeType: "action",
        status: mapInngestSpanStatus(span.status),
        input: null,
        output: null,
        error: null,
        startedAt,
        completedAt,
        duration:
          startedAt && completedAt
            ? String(completedAt.getTime() - startedAt.getTime())
            : null,
        timestamp: startedAt,
      } satisfies WorkflowExecutionLog;
    })
    .toSorted(
      (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
    );
}

function historyTypeToEventType(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1.$2")
    .replace(/\.+/g, ".")
    .toLowerCase();
}

function mapExecutionEventsFromHistory(input: {
  execution: WorkflowExecution;
  run: InngestFunctionRun | null;
}): WorkflowExecutionEvent[] {
  if (!input.run) {
    return [];
  }

  return input.run.history.map((item) => {
    const eventType = historyTypeToEventType(item.type);
    const nodeLabel = item.stepName?.trim();
    const message = nodeLabel
      ? `${eventType} (${nodeLabel})`
      : `${eventType} (${item.type})`;

    return {
      id: toSyntheticUuid(
        `execution-event:${input.execution.id}:${input.run?.id ?? "unknown"}:${item.id}`,
      ),
      orgId: input.execution.orgId,
      workflowId: input.execution.workflowId,
      executionId: input.execution.id,
      eventType,
      message,
      metadata: {
        attempt: item.attempt,
        ...(item.stepName ? { nodeName: item.stepName } : {}),
        ...(item.result?.errorCode ? { errorCode: item.result.errorCode } : {}),
      },
      createdAt: item.createdAt,
    } satisfies WorkflowExecutionEvent;
  });
}

class InngestWorkflowRuntimeProvider implements WorkflowRuntimeProvider {
  async resolveRunIdFromEvent(eventId: string): Promise<string | null> {
    if (!eventId) {
      return null;
    }

    try {
      const run = await inngestRunsClient.getLatestRunForEvent(eventId);
      return run?.runId ?? null;
    } catch {
      return null;
    }
  }

  private async getRunContext(runIdentifier: string): Promise<{
    runId: string | null;
    run: InngestFunctionRun | null;
  }> {
    if (!runIdentifier) {
      return {
        runId: null,
        run: null,
      };
    }

    try {
      const directRun = await inngestRunsClient.getFunctionRun(runIdentifier);
      if (directRun) {
        return {
          runId: directRun.id,
          run: directRun,
        };
      }
    } catch {
      // Continue with event-id lookup fallback.
    }

    try {
      const latestRun =
        await inngestRunsClient.getLatestRunForEvent(runIdentifier);
      if (!latestRun?.runId) {
        return {
          runId: null,
          run: null,
        };
      }

      const run = await inngestRunsClient.getFunctionRun(latestRun.runId);
      return {
        runId: latestRun.runId,
        run,
      };
    } catch {
      return {
        runId: null,
        run: null,
      };
    }
  }

  private async getHydratedExecutionAndTrace(
    execution: WorkflowExecution,
  ): Promise<{
    execution: WorkflowExecution;
    trace: InngestRunTrace | null;
  }> {
    if (!execution.workflowRunId) {
      return {
        execution,
        trace: null,
      };
    }

    const { runId, run } = await this.getRunContext(execution.workflowRunId);
    if (!run || !runId) {
      return {
        execution,
        trace: null,
      };
    }

    const trace = await inngestRunsClient.getRunTrace(runId).catch(() => null);
    const hydrated = mapExecutionFromInngest({ execution, run, trace });

    return {
      execution: {
        ...hydrated,
        workflowRunId: runId,
      },
      trace,
    };
  }

  async hydrateExecution(
    execution: WorkflowExecution,
  ): Promise<WorkflowExecution> {
    const hydrated = await this.getHydratedExecutionAndTrace(execution);
    return hydrated.execution;
  }

  async listExecutionLogs(
    execution: WorkflowExecution,
  ): Promise<WorkflowExecutionLog[]> {
    const hydrated = await this.getHydratedExecutionAndTrace(execution);
    if (!hydrated.execution.workflowRunId) {
      return [];
    }

    return mapExecutionLogsFromTrace({
      execution: hydrated.execution,
      trace: hydrated.trace,
    });
  }

  async listExecutionEvents(
    execution: WorkflowExecution,
  ): Promise<WorkflowExecutionEvent[]> {
    if (!execution.workflowRunId) {
      return [];
    }

    const { run } = await this.getRunContext(execution.workflowRunId);
    return mapExecutionEventsFromHistory({ execution, run });
  }

  async getExecutionStatus(execution: WorkflowExecution): Promise<{
    status: WorkflowExecutionStatus;
    nodeStatuses: WorkflowExecutionNodeStatus[];
  }> {
    const hydrated = await this.getHydratedExecutionAndTrace(execution);
    const logs = mapExecutionLogsFromTrace({
      execution: hydrated.execution,
      trace: hydrated.trace,
    });

    const nodeStatuses = Array.from(
      logs
        .toSorted(
          (left, right) => right.timestamp.getTime() - left.timestamp.getTime(),
        )
        .reduce((latestByNode, log) => {
          if (latestByNode.has(log.nodeId)) {
            return latestByNode;
          }

          latestByNode.set(log.nodeId, {
            nodeId: log.nodeId,
            status:
              hydrated.execution.status === "cancelled" &&
              (log.status === "pending" || log.status === "running")
                ? "cancelled"
                : log.status,
          });

          return latestByNode;
        }, new Map<string, WorkflowExecutionNodeStatus>()),
    ).map(([, nodeStatus]) => nodeStatus);

    return {
      status: hydrated.execution.status,
      nodeStatuses,
    };
  }

  async cancelExecution(runId: string): Promise<void> {
    await inngestRunsClient.cancelRun(runId);
  }
}

export const workflowRuntimeProvider: WorkflowRuntimeProvider =
  new InngestWorkflowRuntimeProvider();
