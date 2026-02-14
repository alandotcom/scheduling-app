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
  sendWorkflowWaitSignal,
  type WorkflowCancelRequestedEventData,
  type WorkflowRunRequestedEventData,
  type WorkflowWaitSignalEventData,
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

type WaitSignalRequester = (
  payload: WorkflowWaitSignalEventData,
) => Promise<{ eventId?: string }>;

export type WorkflowDomainTriggerDependencies = {
  runRequester?: RunRequester;
  cancelRequester?: CancelRequester;
  waitSignalRequester?: WaitSignalRequester;
  enableResumes?: boolean;
};

type CancellationSummary = {
  cancelledExecutions: number;
  cancelledWaits: number;
  failedExecutions?: string[];
};

type TriggerWaitStateRef = Pick<
  WorkflowWaitState,
  "id" | "executionId" | "nodeId" | "hookToken" | "metadata"
>;

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
  resumedWorkflowIds?: string[];
  erroredWorkflowIds: string[];
};

function parseCsvSet(value: unknown): Set<string> {
  if (typeof value !== "string") {
    return new Set();
  }

  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

function isWaitStateResumableForEvent(
  waitState: TriggerWaitStateRef,
  eventType: DomainEventType,
): boolean {
  if (!waitState.hookToken) {
    return false;
  }

  const metadata = waitState.metadata ?? {};
  const waitForEvents = parseCsvSet(metadata["waitForEvents"]);
  return waitForEvents.size === 0 || waitForEvents.has(eventType);
}

async function startWorkflowExecution(input: {
  tx: DbClient;
  event: WorkflowDomainEventEnvelope<DomainEventType>;
  workflow: Workflow;
  correlationKey: string | undefined;
  runRequester: RunRequester;
}): Promise<WorkflowExecution> {
  const triggerInput = input.event.payload;
  const correlationKey: string | null = input.correlationKey ?? null;
  const execution = await workflowRepository.createExecution(
    input.tx,
    input.event.orgId,
    {
      workflowId: input.workflow.id,
      status: "running",
      triggerType: "domain_event",
      isDryRun: false,
      triggerEventType: input.event.type,
      correlationKey,
      input: triggerInput,
    },
  );

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

async function resumeWaitingRuns(input: {
  tx: DbClient;
  orgId: string;
  eventType: DomainEventType;
  correlationKey: string;
  payload: Record<string, unknown>;
  waitStates: TriggerWaitStateRef[];
  waitSignalRequester: WaitSignalRequester;
}): Promise<number> {
  const resumableWaitStates = input.waitStates.filter((waitState) =>
    isWaitStateResumableForEvent(waitState, input.eventType),
  );
  let resumedCount = 0;

  await forEachAsync(
    resumableWaitStates,
    async (waitState) => {
      try {
        await input.waitSignalRequester({
          executionId: waitState.executionId,
          nodeId: waitState.nodeId,
          token: waitState.hookToken,
          eventType: input.eventType,
          correlationKey: input.correlationKey,
          payload: input.payload,
        });
      } catch {
        return;
      }

      const waitUpdated = await workflowRepository.markWaitStateResumed(
        input.tx,
        input.orgId,
        waitState.id,
      );

      if (!waitUpdated) {
        return;
      }

      resumedCount += 1;
      await workflowRepository.markExecutionRunning(
        input.tx,
        input.orgId,
        waitState.executionId,
      );
    },
    { concurrency: 1 },
  );

  return resumedCount;
}

export async function processWorkflowDomainEvent(
  event: WorkflowDomainEventEnvelope<DomainEventType>,
  dependencies: WorkflowDomainTriggerDependencies = {},
): Promise<WorkflowDomainEventProcessingResult> {
  const runRequester = dependencies.runRequester ?? sendWorkflowRunRequested;
  const cancelRequester =
    dependencies.cancelRequester ?? sendWorkflowCancelRequested;
  const waitSignalRequester =
    dependencies.waitSignalRequester ?? sendWorkflowWaitSignal;
  const enableResumes = dependencies.enableResumes ?? true;

  return withOrg(event.orgId, async (tx) => {
    const workflows = await workflowRepository.findMany(tx, event.orgId);
    const startedExecutionIds: string[] = [];
    const ignoredWorkflowIds: string[] = [];
    const ignored: Array<{
      workflowId: string;
      reason: WorkflowExecutionIgnoredReason;
    }> = [];
    const cancelledWorkflowIds: string[] = [];
    const resumedWorkflowIds: string[] = [];
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
              enableResumes,
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
              resumeWaitStates: async (eventType) => {
                if (!evaluation.correlationKey) {
                  return 0;
                }

                return await resumeWaitingRuns({
                  tx,
                  orgId: event.orgId,
                  eventType,
                  correlationKey: evaluation.correlationKey,
                  payload: event.payload,
                  waitStates,
                  waitSignalRequester,
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

          if (outcome.status === "resumed") {
            resumedWorkflowIds.push(workflow.id);
            return;
          }

          ignoredWorkflowIds.push(workflow.id);
          ignored.push({
            workflowId: workflow.id,
            reason: outcome.reason,
          });
        } catch {
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
      resumedWorkflowIds,
      erroredWorkflowIds,
    };
  });
}
