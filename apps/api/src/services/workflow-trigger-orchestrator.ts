import type {
  DomainEventType,
  WorkflowExecutionCancelledResponse,
  WorkflowExecutionIgnoredResponse,
  WorkflowExecutionResumedResponse,
  WorkflowExecutionRunningResponse,
} from "@scheduling/dto";
import type { TriggerRoutingDecision } from "./workflow-trigger-registry.js";

type TriggerIgnoreReason =
  | "missing_event_type"
  | "event_not_configured"
  | "no_waiting_runs";

type TriggerWaitState = {
  id: string;
  executionId: string;
  nodeId: string;
  hookToken: string | null;
  metadata: Record<string, unknown> | null;
};

type CancellationSummary = {
  cancelledExecutions: number;
  cancelledWaits: number;
  failedExecutions?: string[];
};

type RunningCancellationSummary = {
  cancelledExecutions: number;
  cancelledWaits: number;
  simulated?: boolean;
};

type TriggerOrchestratorInput = {
  dryRun: boolean;
  eventType?: DomainEventType;
  eventTypePath?: string;
  correlationKey?: string;
  routingDecision: TriggerRoutingDecision;
  waitStates: TriggerWaitState[];
  enableResumes: boolean;
  startExecution: () => Promise<{
    executionId: string;
    runId?: string;
    dryRun: boolean;
  }>;
  cancelWaitStates: (
    eventType: DomainEventType,
  ) => Promise<CancellationSummary>;
  resumeWaitStates: (
    eventType: DomainEventType,
    waitStates: TriggerWaitState[],
  ) => Promise<number>;
};

export type TriggerOrchestratorResult =
  | WorkflowExecutionRunningResponse
  | WorkflowExecutionCancelledResponse
  | WorkflowExecutionIgnoredResponse
  | WorkflowExecutionResumedResponse;

function parseCsvSet(value: unknown): Set<string> {
  if (typeof value !== "string") {
    return new Set();
  }

  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
}

function toCancellationSummary(waitStates: TriggerWaitState[]): {
  cancelledExecutions: number;
  cancelledWaits: number;
} {
  return {
    cancelledExecutions: new Set(waitStates.map((state) => state.executionId))
      .size,
    cancelledWaits: waitStates.length,
  };
}

function countResumableWaitStates(
  waitStates: TriggerWaitState[],
  eventType: DomainEventType,
): number {
  return waitStates.filter((waitState) => {
    if (!waitState.hookToken) {
      return false;
    }

    const metadata = waitState.metadata ?? {};
    const waitForEvents = parseCsvSet(metadata["waitForEvents"]);
    return waitForEvents.size === 0 || waitForEvents.has(eventType);
  }).length;
}

function ignored(
  reason: TriggerIgnoreReason,
): WorkflowExecutionIgnoredResponse {
  return {
    status: "ignored",
    reason,
  };
}

async function handleStopOrRestart(
  input: TriggerOrchestratorInput,
): Promise<
  | WorkflowExecutionCancelledResponse
  | WorkflowExecutionRunningResponse
  | WorkflowExecutionIgnoredResponse
  | undefined
> {
  if (!input.eventType) {
    return;
  }

  if (
    input.routingDecision.kind !== "stop" &&
    input.routingDecision.kind !== "restart"
  ) {
    return;
  }

  if (input.waitStates.length === 0) {
    return ignored("no_waiting_runs");
  }

  if (input.routingDecision.kind === "stop") {
    if (input.dryRun) {
      return {
        status: "cancelled",
        dryRun: true,
        simulated: true,
        ...toCancellationSummary(input.waitStates),
      };
    }

    return {
      status: "cancelled",
      dryRun: false,
      ...(await input.cancelWaitStates(input.eventType)),
    };
  }

  const cancellationSummary: RunningCancellationSummary = input.dryRun
    ? {
        ...toCancellationSummary(input.waitStates),
        simulated: true,
      }
    : await input.cancelWaitStates(input.eventType).then((summary) => ({
        cancelledExecutions: summary.cancelledExecutions,
        cancelledWaits: summary.cancelledWaits,
      }));

  const execution = await input.startExecution();
  return {
    status: "running",
    executionId: execution.executionId,
    runId: execution.runId,
    dryRun: execution.dryRun,
    ...cancellationSummary,
  };
}

async function handleResumes(
  input: TriggerOrchestratorInput,
): Promise<WorkflowExecutionResumedResponse | undefined> {
  if (!input.enableResumes) {
    return;
  }

  if (
    !(input.eventType && input.correlationKey) ||
    input.waitStates.length === 0
  ) {
    return;
  }

  if (input.dryRun) {
    const resumedCount = countResumableWaitStates(
      input.waitStates,
      input.eventType,
    );
    if (resumedCount > 0) {
      return {
        status: "resumed",
        resumedCount,
        dryRun: true,
        simulated: true,
      };
    }
    return;
  }

  const resumedCount = await input.resumeWaitStates(
    input.eventType,
    input.waitStates,
  );
  if (resumedCount > 0) {
    return {
      status: "resumed",
      resumedCount,
    };
  }

  return;
}

export async function orchestrateTriggerExecution(
  input: TriggerOrchestratorInput,
): Promise<TriggerOrchestratorResult> {
  if (
    input.routingDecision.kind === "ignore" &&
    input.routingDecision.reason === "missing_event_type"
  ) {
    return {
      status: "ignored",
      reason: "missing_event_type",
    };
  }

  const stopOrRestartOutcome = await handleStopOrRestart(input);
  if (stopOrRestartOutcome) {
    return stopOrRestartOutcome;
  }

  const resumeOutcome = await handleResumes(input);
  if (resumeOutcome) {
    return resumeOutcome;
  }

  if (
    input.routingDecision.kind === "ignore" &&
    input.routingDecision.reason === "event_not_configured"
  ) {
    return ignored("event_not_configured");
  }

  const execution = await input.startExecution();
  return {
    status: "running",
    executionId: execution.executionId,
    runId: execution.runId,
    dryRun: execution.dryRun,
  };
}
