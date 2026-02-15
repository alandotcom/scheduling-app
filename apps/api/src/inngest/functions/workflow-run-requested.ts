import { executeWorkflowRunRequested } from "../../services/workflow-run-requested.js";
import { inngest } from "../client.js";

type ExecuteWorkflowRunRequested = typeof executeWorkflowRunRequested;

export function createWorkflowRunRequestedFunction(
  executeRun: ExecuteWorkflowRunRequested = executeWorkflowRunRequested,
) {
  return inngest.createFunction(
    {
      id: "workflow-run-requested",
      retries: 0,
      concurrency: {
        key: "event.data.orgId",
        limit: 20,
      },
    },
    { event: "workflow/run.requested" },
    async ({ event, step }) => {
      await executeRun(event.data, {
        sleep: async (stepId, delayMs) => {
          if (delayMs <= 0) {
            return;
          }

          await step.sleep(stepId, Math.ceil(delayMs));
        },
      });

      return {
        executionId: event.data.executionId,
        workflowId: event.data.workflowId,
        status: "processed",
      };
    },
  );
}

export const workflowRunRequestedFunction =
  createWorkflowRunRequestedFunction();
