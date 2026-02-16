import { forEachAsync } from "es-toolkit/array";
import type { DomainEventType } from "@scheduling/dto";
import type { DbClient } from "../lib/db.js";
import {
  workflowRepository,
  type WorkflowWaitState,
} from "../repositories/workflows.js";
import type { WorkflowCancelRequestedEventData } from "../inngest/runtime-events.js";

export type WorkflowCancelRequester = (
  payload: WorkflowCancelRequestedEventData,
) => Promise<{ eventId?: string }>;

export async function requestWorkflowExecutionCancellations(input: {
  executionIds: string[];
  workflowId: string;
  reason: string;
  requestedBy: string;
  cancelRequester: WorkflowCancelRequester;
  eventType?: DomainEventType;
  correlationKey?: string;
  continueOnError?: boolean;
}): Promise<{
  successfulExecutionIds: string[];
  failedExecutionIds: string[];
}> {
  const successfulExecutionIds: string[] = [];
  const failedExecutionIds: string[] = [];

  await forEachAsync(
    input.executionIds,
    async (executionId) => {
      try {
        await input.cancelRequester({
          executionId,
          workflowId: input.workflowId,
          reason: input.reason,
          requestedBy: input.requestedBy,
          ...(input.eventType ? { eventType: input.eventType } : {}),
          ...(input.correlationKey
            ? { correlationKey: input.correlationKey }
            : {}),
        });
        successfulExecutionIds.push(executionId);
      } catch (error: unknown) {
        if (!input.continueOnError) {
          throw error;
        }

        failedExecutionIds.push(executionId);
      }
    },
    { concurrency: 1 },
  );

  return {
    successfulExecutionIds,
    failedExecutionIds,
  };
}

export async function cancelWaitingExecutionsInDatabase(input: {
  tx: DbClient;
  orgId: string;
  waitStates: WorkflowWaitState[];
  reason: string;
  executionIds?: string[];
}): Promise<{
  cancelledExecutions: number;
  cancelledWaits: number;
  cancelledExecutionIds: string[];
}> {
  if (input.waitStates.length === 0) {
    return {
      cancelledExecutions: 0,
      cancelledWaits: 0,
      cancelledExecutionIds: [],
    };
  }

  const executionIdSet = input.executionIds
    ? new Set(input.executionIds)
    : null;
  const waitStatesToCancel = executionIdSet
    ? input.waitStates.filter((state) => executionIdSet.has(state.executionId))
    : input.waitStates;

  if (waitStatesToCancel.length === 0) {
    return {
      cancelledExecutions: 0,
      cancelledWaits: 0,
      cancelledExecutionIds: [],
    };
  }

  const cancelledWaitStateIds =
    await workflowRepository.markWaitingStatesCancelled(
      input.tx,
      input.orgId,
      waitStatesToCancel.map((state) => state.id),
    );
  const cancelledWaitStateIdSet = new Set(cancelledWaitStateIds);
  const cancelledExecutionIds = Array.from(
    new Set(
      waitStatesToCancel
        .filter((state) => cancelledWaitStateIdSet.has(state.id))
        .map((state) => state.executionId),
    ),
  );

  await forEachAsync(
    cancelledExecutionIds,
    async (executionId) => {
      await workflowRepository.markExecutionCancelled(
        input.tx,
        input.orgId,
        executionId,
        input.reason,
      );
    },
    { concurrency: 1 },
  );

  return {
    cancelledExecutions: cancelledExecutionIds.length,
    cancelledWaits: cancelledWaitStateIds.length,
    cancelledExecutionIds,
  };
}
