import { inngest } from "../client.js";
import {
  markWorkflowRunStatus,
  recordWorkflowRunStart,
} from "../../services/workflows/runtime.js";

type WorkflowExecutionDependencies = {
  recordRunStart: typeof recordWorkflowRunStart;
  markRunStatus: typeof markWorkflowRunStatus;
};

function createDefaultDependencies(): WorkflowExecutionDependencies {
  return {
    recordRunStart: recordWorkflowRunStart,
    markRunStatus: markWorkflowRunStatus,
  };
}

export function createWorkflowExecutionFunction(
  dependencies: WorkflowExecutionDependencies = createDefaultDependencies(),
) {
  return inngest.createFunction(
    {
      id: "workflow-execution",
      retries: 10,
    },
    { event: "scheduling/workflow.triggered" },
    async ({ event, runId, step }) => {
      await step.run("record-workflow-run-start", async () => {
        await dependencies.recordRunStart({
          orgId: event.data.orgId,
          runId,
          definitionId: event.data.workflow.definitionId,
          versionId: event.data.workflow.versionId,
          workflowType: event.data.workflow.workflowType,
          entityType: event.data.entity.type,
          entityId: event.data.entity.id,
        });
      });

      await step.run("mark-workflow-run-completed", async () => {
        await dependencies.markRunStatus({
          orgId: event.data.orgId,
          runId,
          status: "completed",
        });
      });

      return {
        runId,
        orgId: event.data.orgId,
        definitionId: event.data.workflow.definitionId,
        versionId: event.data.workflow.versionId,
        workflowType: event.data.workflow.workflowType,
        entityType: event.data.entity.type,
        entityId: event.data.entity.id,
        status: "completed" as const,
      };
    },
  );
}

export const workflowExecutionFunction = createWorkflowExecutionFunction();
