import { forEachAsync } from "es-toolkit/array";
import type {
  DomainEventType,
  WorkflowExecutionIgnoredReason,
  WorkflowTriggerExecutionResponse,
} from "@scheduling/dto";
import { withOrg } from "../lib/db.js";
import type { DbClient } from "../lib/db.js";
import {
  workflowRepository,
  type Workflow,
  type WorkflowExecution,
  type WorkflowWaitState,
} from "../repositories/workflows.js";
import {
  evaluateWorkflowDomainEventTrigger,
  getWorkflowTriggerConfig,
} from "./workflow-trigger-registry.js";
import {
  sendWorkflowCancelRequested,
  sendWorkflowRunRequested,
  type WorkflowRunRequestedEventData,
} from "../inngest/runtime-events.js";
import { orchestrateTriggerExecution } from "./workflow-trigger-orchestrator.js";
import {
  cancelWaitingExecutionsInDatabase,
  requestWorkflowExecutionCancellations,
  type WorkflowCancelRequester,
} from "./workflow-cancellation.js";
import { workflowRuntimeProvider } from "./workflow-runtime-provider.js";

type WorkflowDomainEventEnvelope<TEventType extends DomainEventType> = {
  id: string;
  orgId: string;
  type: TEventType;
  payload: Record<string, unknown>;
  timestamp: string;
};

type RunRequester = (
  payload: WorkflowRunRequestedEventData,
) => Promise<{ eventId?: string }>;

export type WorkflowDomainTriggerDependencies = {
  runRequester?: RunRequester;
  cancelRequester?: WorkflowCancelRequester;
};

type CancellationSummary = {
  cancelledExecutions: number;
  cancelledWaits: number;
  failedExecutions?: string[];
};

const UNIQUE_CONSTRAINT_VIOLATION = "23505";

class DuplicateTriggerEventError extends Error {
  constructor() {
    super("Duplicate domain event already processed for workflow");
  }
}

function getConstraintName(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  if ("constraint" in error && typeof error.constraint === "string") {
    return error.constraint;
  }

  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const cause = error.cause as { constraint?: unknown };
    if (typeof cause.constraint === "string") {
      return cause.constraint;
    }
  }

  return null;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("code" in error && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
    return true;
  }

  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const cause = error.cause as { code?: unknown; errno?: unknown };
    return (
      cause.code === UNIQUE_CONSTRAINT_VIOLATION ||
      cause.errno === UNIQUE_CONSTRAINT_VIOLATION
    );
  }

  return false;
}

function isDuplicateTriggerEventConstraint(error: unknown): boolean {
  if (!isUniqueConstraintViolation(error)) {
    return false;
  }

  return (
    getConstraintName(error) ===
    "workflow_executions_org_workflow_trigger_event_uidx"
  );
}

export type WorkflowDomainEventProcessingResult = {
  eventId: string;
  eventType: DomainEventType;
  orgId: string;
  startedExecutionIds: string[];
  ignoredWorkflowIds: string[];
  ignored?: Array<{
    workflowId: string;
    reason: WorkflowExecutionIgnoredReason;
  }>;
  cancelledWorkflowIds?: string[];
  erroredWorkflowIds: string[];
};

async function startWorkflowExecution(input: {
  tx: DbClient;
  event: WorkflowDomainEventEnvelope<DomainEventType>;
  workflow: Workflow;
  correlationKey: string | undefined;
  runRequester: RunRequester;
}): Promise<WorkflowExecution> {
  const triggerInput = input.event.payload;
  const correlationKey: string | null = input.correlationKey ?? null;
  const execution = await workflowRepository
    .createExecution(input.tx, input.event.orgId, {
      workflowId: input.workflow.id,
      status: "running",
      triggerType: "domain_event",
      isDryRun: false,
      triggerEventType: input.event.type,
      triggerEventId: input.event.id,
      correlationKey,
      input: triggerInput,
    })
    .catch((error: unknown) => {
      if (isDuplicateTriggerEventConstraint(error)) {
        throw new DuplicateTriggerEventError();
      }

      throw error;
    });

  let runId: string | null = null;

  try {
    const run = await input.runRequester({
      orgId: input.event.orgId,
      workflowId: input.workflow.id,
      workflowName: input.workflow.name,
      executionId: execution.id,
      graph: input.workflow.graph,
      triggerInput,
      eventContext: {
        eventType: input.event.type,
        ...(input.correlationKey
          ? { correlationKey: input.correlationKey }
          : {}),
      },
    });

    const resolvedRunId = run.eventId
      ? await workflowRuntimeProvider.resolveRunIdFromEvent(run.eventId)
      : null;
    runId = resolvedRunId ?? run.eventId ?? null;

    await workflowRepository.setExecutionRunId(
      input.tx,
      input.event.orgId,
      execution.id,
      runId ?? null,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to request workflow run";

    await workflowRepository.markExecutionErrored(
      input.tx,
      input.event.orgId,
      execution.id,
      message,
    );

    throw error;
  }

  return {
    ...execution,
    workflowRunId: runId ?? execution.workflowRunId,
  };
}

async function cancelWaitingRuns(input: {
  tx: DbClient;
  orgId: string;
  workflowId: string;
  correlationKey: string;
  eventType: DomainEventType;
  waitStates: WorkflowWaitState[];
  cancelRequester: WorkflowCancelRequester;
}): Promise<CancellationSummary> {
  const executionIds = Array.from(
    new Set(input.waitStates.map((waitState) => waitState.executionId)),
  );
  const requestedCancellations = await requestWorkflowExecutionCancellations({
    executionIds,
    workflowId: input.workflowId,
    reason: `Cancelled by ${input.eventType} (${input.correlationKey})`,
    requestedBy: input.workflowId,
    cancelRequester: input.cancelRequester,
    eventType: input.eventType,
    correlationKey: input.correlationKey,
    continueOnError: true,
  });

  const cancelled = await cancelWaitingExecutionsInDatabase({
    tx: input.tx,
    orgId: input.orgId,
    waitStates: input.waitStates,
    reason: `Cancelled by ${input.eventType} (${input.correlationKey})`,
    executionIds: requestedCancellations.successfulExecutionIds,
  });

  return {
    cancelledExecutions: cancelled.cancelledExecutions,
    cancelledWaits: cancelled.cancelledWaits,
    ...(requestedCancellations.failedExecutionIds.length > 0
      ? { failedExecutions: requestedCancellations.failedExecutionIds }
      : {}),
  };
}

export async function processWorkflowDomainEvent(
  event: WorkflowDomainEventEnvelope<DomainEventType>,
  dependencies: WorkflowDomainTriggerDependencies = {},
): Promise<WorkflowDomainEventProcessingResult> {
  const runRequester = dependencies.runRequester ?? sendWorkflowRunRequested;
  const cancelRequester =
    dependencies.cancelRequester ?? sendWorkflowCancelRequested;

  return withOrg(event.orgId, async (tx) => {
    const workflows = (
      await workflowRepository.findMany(tx, event.orgId)
    ).filter((workflow) => workflow.isEnabled);
    const startedExecutionIds: string[] = [];
    const ignoredWorkflowIds: string[] = [];
    const ignored: Array<{
      workflowId: string;
      reason: WorkflowExecutionIgnoredReason;
    }> = [];
    const cancelledWorkflowIds: string[] = [];
    const erroredWorkflowIds: string[] = [];

    await forEachAsync(
      workflows,
      async (workflow) => {
        const triggerConfig = getWorkflowTriggerConfig(workflow.graph);
        const evaluation = evaluateWorkflowDomainEventTrigger({
          config: triggerConfig,
          eventType: event.type,
          payload: event.payload,
        });

        try {
          const waitStates = evaluation.correlationKey
            ? await workflowRepository.listWorkflowWaitingStatesByCorrelation(
                tx,
                event.orgId,
                {
                  workflowId: workflow.id,
                  correlationKey: evaluation.correlationKey,
                },
              )
            : [];

          const outcome: WorkflowTriggerExecutionResponse =
            await orchestrateTriggerExecution({
              dryRun: false,
              eventType: event.type,
              routingDecision: evaluation.routingDecision,
              waitStates,
              ...(evaluation.correlationKey
                ? { correlationKey: evaluation.correlationKey }
                : {}),
              startExecution: async () => {
                const execution = await startWorkflowExecution({
                  tx,
                  event,
                  workflow,
                  correlationKey: evaluation.correlationKey,
                  runRequester,
                });

                const result: {
                  executionId: string;
                  dryRun: boolean;
                  runId?: string;
                } = {
                  executionId: execution.id,
                  dryRun: false,
                };

                if (execution.workflowRunId) {
                  result.runId = execution.workflowRunId;
                }

                return result;
              },
              cancelWaitStates: async (eventType) => {
                if (!evaluation.correlationKey) {
                  return {
                    cancelledExecutions: 0,
                    cancelledWaits: 0,
                  };
                }

                return await cancelWaitingRuns({
                  tx,
                  orgId: event.orgId,
                  workflowId: workflow.id,
                  correlationKey: evaluation.correlationKey,
                  eventType,
                  waitStates,
                  cancelRequester,
                });
              },
            });

          if (outcome.status === "running") {
            startedExecutionIds.push(outcome.executionId);
            return;
          }

          if (outcome.status === "cancelled") {
            cancelledWorkflowIds.push(workflow.id);
            return;
          }

          ignoredWorkflowIds.push(workflow.id);
          ignored.push({
            workflowId: workflow.id,
            reason: outcome.reason,
          });
        } catch (error: unknown) {
          if (error instanceof DuplicateTriggerEventError) {
            ignoredWorkflowIds.push(workflow.id);
            ignored.push({
              workflowId: workflow.id,
              reason: "duplicate_event",
            });
            return;
          }

          erroredWorkflowIds.push(workflow.id);
        }
      },
      { concurrency: 1 },
    );

    return {
      eventId: event.id,
      eventType: event.type,
      orgId: event.orgId,
      startedExecutionIds,
      ignoredWorkflowIds,
      ignored,
      cancelledWorkflowIds,
      erroredWorkflowIds,
    };
  });
}
