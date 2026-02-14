import { forEachAsync } from "es-toolkit/array";
import type { DomainEventType } from "@scheduling/dto";
import { withOrg } from "../lib/db.js";
import type { DbClient } from "../lib/db.js";
import {
  workflowRepository,
  type Workflow,
  type WorkflowExecution,
} from "../repositories/workflows.js";
import {
  evaluateWorkflowDomainEventTrigger,
  getWorkflowTriggerConfig,
} from "./workflow-trigger-registry.js";
import {
  sendWorkflowRunRequested,
  type WorkflowRunRequestedEventData,
} from "../inngest/runtime-events.js";

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

export type WorkflowDomainEventProcessingResult = {
  eventId: string;
  eventType: DomainEventType;
  orgId: string;
  startedExecutionIds: string[];
  ignoredWorkflowIds: string[];
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

export async function processWorkflowDomainEvent(
  event: WorkflowDomainEventEnvelope<DomainEventType>,
  runRequester: RunRequester = sendWorkflowRunRequested,
): Promise<WorkflowDomainEventProcessingResult> {
  return withOrg(event.orgId, async (tx) => {
    const workflows = await workflowRepository.findMany(tx, event.orgId);
    const startedExecutionIds: string[] = [];
    const ignoredWorkflowIds: string[] = [];
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

        if (evaluation.routingDecision.kind !== "start") {
          ignoredWorkflowIds.push(workflow.id);
          return;
        }

        try {
          const execution = await startWorkflowExecution({
            tx,
            event,
            workflow,
            correlationKey: evaluation.correlationKey,
            runRequester,
          });

          startedExecutionIds.push(execution.id);
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
      erroredWorkflowIds,
    };
  });
}
