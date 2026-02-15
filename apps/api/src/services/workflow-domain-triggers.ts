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
  type WorkflowCancelRequestedEventData,
  type WorkflowRunRequestedEventData,
} from "../inngest/runtime-events.js";
import { orchestrateTriggerExecution } from "./workflow-trigger-orchestrator.js";

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

type CancelRequester = (
  payload: WorkflowCancelRequestedEventData,
) => Promise<{ eventId?: string }>;

export type WorkflowDomainTriggerDependencies = {
  runRequester?: RunRequester;
  cancelRequester?: CancelRequester;
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

    await workflowRepository.setExecutionRunId(
      input.tx,
      input.event.orgId,
      execution.id,
      run.eventId ?? null,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to enqueue workflow run";

    await workflowRepository.markExecutionErrored(
      input.tx,
      input.event.orgId,
      execution.id,
      message,
    );

    throw error;
  }

  return execution;
}

async function cancelWaitingRuns(input: {
  tx: DbClient;
  orgId: string;
  workflowId: string;
  correlationKey: string;
  eventType: DomainEventType;
  waitStates: WorkflowWaitState[];
  cancelRequester: CancelRequester;
}): Promise<CancellationSummary> {
  const uniqueExecutionIds = Array.from(
    new Set(input.waitStates.map((waitState) => waitState.executionId)),
  );
  const successfulExecutionIds: string[] = [];
  const failedExecutionIds: string[] = [];

  await forEachAsync(
    uniqueExecutionIds,
    async (executionId) => {
      try {
        await input.cancelRequester({
          executionId,
          workflowId: input.workflowId,
          reason: `Cancelled by ${input.eventType} (${input.correlationKey})`,
          requestedBy: input.workflowId,
          eventType: input.eventType,
          correlationKey: input.correlationKey,
        });
        successfulExecutionIds.push(executionId);
      } catch {
        failedExecutionIds.push(executionId);
      }
    },
    { concurrency: 1 },
  );

  const successfulExecutionIdSet = new Set(successfulExecutionIds);
  const waitStateIdsToCancel = input.waitStates
    .filter((waitState) => successfulExecutionIdSet.has(waitState.executionId))
    .map((waitState) => waitState.id);
  const cancelledWaitStateIds =
    await workflowRepository.markWaitingStatesCancelled(
      input.tx,
      input.orgId,
      waitStateIdsToCancel,
    );

  await forEachAsync(
    successfulExecutionIds,
    async (executionId) => {
      await workflowRepository.markExecutionCancelled(
        input.tx,
        input.orgId,
        executionId,
        `Cancelled by ${input.eventType} (${input.correlationKey})`,
      );
    },
    { concurrency: 1 },
  );

  return {
    cancelledExecutions: successfulExecutionIds.length,
    cancelledWaits: cancelledWaitStateIds.length,
    ...(failedExecutionIds.length > 0
      ? { failedExecutions: failedExecutionIds }
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
          const existingExecution =
            await workflowRepository.findExecutionByTriggerEventId(
              tx,
              event.orgId,
              {
                workflowId: workflow.id,
                triggerEventId: event.id,
              },
            );

          if (existingExecution) {
            ignoredWorkflowIds.push(workflow.id);
            ignored.push({
              workflowId: workflow.id,
              reason: "duplicate_event",
            });
            return;
          }

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
