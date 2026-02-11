import { inngest } from "../client.js";
import {
  buildWorkflowDeliveryKey,
  cancelReplacedWorkflowRuns,
  getWorkflowRunGuard,
  loadWorkflowCorrelatedEntity,
  markWorkflowRunStatus,
  recordWorkflowDeliveryWithGuard,
  recordWorkflowRunStart,
} from "../../services/workflows/runtime.js";

type WorkflowExecutionDependencies = {
  recordRunStart: typeof recordWorkflowRunStart;
  cancelReplacedRuns: typeof cancelReplacedWorkflowRuns;
  getRunGuard: typeof getWorkflowRunGuard;
  loadCorrelatedEntity: typeof loadWorkflowCorrelatedEntity;
  recordDeliveryWithGuard: typeof recordWorkflowDeliveryWithGuard;
  markRunStatus: typeof markWorkflowRunStatus;
};

function createDefaultDependencies(): WorkflowExecutionDependencies {
  return {
    recordRunStart: recordWorkflowRunStart,
    cancelReplacedRuns: cancelReplacedWorkflowRuns,
    getRunGuard: getWorkflowRunGuard,
    loadCorrelatedEntity: loadWorkflowCorrelatedEntity,
    recordDeliveryWithGuard: recordWorkflowDeliveryWithGuard,
    markRunStatus: markWorkflowRunStatus,
  };
}

const REPLACEMENT_TRIGGER_MATCH_EXPRESSION =
  "event.data.entity.type == 'appointment' && async.data.entity.type == 'appointment' && async.id != event.id && event.data.orgId == async.data.orgId && event.data.workflow.definitionId == async.data.workflow.definitionId && event.data.entity.type == async.data.entity.type && event.data.entity.id == async.data.entity.id";
const WORKFLOW_SIDE_EFFECT_CHANNEL = "workflow.runtime";
const WORKFLOW_SIDE_EFFECT_STEP_ID = "workflow.execution.completed";

function shouldWaitForReplacementSignal(event: {
  data: { entity: { type: string }; sourceEvent: { type: string } };
}) {
  return (
    event.data.entity.type === "appointment" &&
    (event.data.sourceEvent.type === "appointment.created" ||
      event.data.sourceEvent.type === "appointment.rescheduled")
  );
}

export function createWorkflowExecutionFunction(
  dependencies: WorkflowExecutionDependencies = createDefaultDependencies(),
) {
  return inngest.createFunction(
    {
      id: "workflow-execution",
      retries: 10,
      cancelOn: [
        {
          event: "scheduling/workflow.triggered",
          if: REPLACEMENT_TRIGGER_MATCH_EXPRESSION,
          timeout: "7d",
        },
      ],
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

      await step.run("cancel-replaced-runs", async () => {
        await dependencies.cancelReplacedRuns({
          orgId: event.data.orgId,
          definitionId: event.data.workflow.definitionId,
          entityType: event.data.entity.type,
          entityId: event.data.entity.id,
          replacementRunId: runId,
        });
      });

      let status: "completed" | "cancelled" = "completed";
      let replacementSignal: unknown = null;
      let terminalReason: "entity_missing" | "unsupported_entity_type" | null =
        null;

      if (shouldWaitForReplacementSignal(event)) {
        replacementSignal = await step.waitForEvent(
          "wait-for-workflow-replacement",
          {
            event: "scheduling/workflow.triggered",
            if: REPLACEMENT_TRIGGER_MATCH_EXPRESSION,
            timeout: "2m",
          },
        );

        if (replacementSignal !== null) {
          status = "cancelled";
        }
      }

      if (status === "completed") {
        const correlatedEntity = await step.run(
          "load-correlated-entity-latest",
          async () => {
            return dependencies.loadCorrelatedEntity({
              orgId: event.data.orgId,
              entityType: event.data.entity.type,
              entityId: event.data.entity.id,
            });
          },
        );

        if (correlatedEntity.status !== "found") {
          terminalReason =
            correlatedEntity.status === "missing"
              ? "entity_missing"
              : "unsupported_entity_type";
        }
      }

      if (status === "completed" && terminalReason === null) {
        const deliveryResult = await step.run(
          "record-workflow-side-effect-delivery",
          async () => {
            const runGuard = await dependencies.getRunGuard({
              orgId: event.data.orgId,
              runId,
            });

            if (!runGuard || runGuard.runStatus !== "running") {
              return "guard_blocked" as const;
            }

            const deliveryKey = buildWorkflowDeliveryKey({
              runId,
              runRevision: runGuard.runRevision,
              stepId: WORKFLOW_SIDE_EFFECT_STEP_ID,
              channel: WORKFLOW_SIDE_EFFECT_CHANNEL,
              target: `${event.data.entity.type}:${event.data.entity.id}`,
            });

            return dependencies.recordDeliveryWithGuard({
              orgId: event.data.orgId,
              definitionId: event.data.workflow.definitionId,
              versionId: event.data.workflow.versionId,
              runId,
              expectedRunRevision: runGuard.runRevision,
              workflowType: event.data.workflow.workflowType,
              stepId: WORKFLOW_SIDE_EFFECT_STEP_ID,
              channel: WORKFLOW_SIDE_EFFECT_CHANNEL,
              target: `${event.data.entity.type}:${event.data.entity.id}`,
              deliveryKey,
            });
          },
        );

        if (deliveryResult === "guard_blocked") {
          status = "cancelled";
        }
      }

      await step.run(`mark-workflow-run-${status}`, async () => {
        await dependencies.markRunStatus({
          orgId: event.data.orgId,
          runId,
          status,
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
        status,
        replacementSignalled: replacementSignal !== null,
        terminalReason,
      };
    },
  );
}

export const workflowExecutionFunction = createWorkflowExecutionFunction();
