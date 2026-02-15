import type {
  DomainEventType,
  WorkflowExecutionCancelledResponse,
  WorkflowExecutionIgnoredResponse,
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
  startExecution: () => Promise<{
    executionId: string;
    runId?: string;
    dryRun: boolean;
  }>;
  cancelWaitStates: (
    eventType: DomainEventType,
  ) => Promise<CancellationSummary>;
};

export type TriggerOrchestratorResult =
  | WorkflowExecutionRunningResponse
  | WorkflowExecutionCancelledResponse
  | WorkflowExecutionIgnoredResponse;

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

  if (
    input.routingDecision.kind === "ignore" &&
    input.routingDecision.reason === "event_not_configured" &&
    input.eventType
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
