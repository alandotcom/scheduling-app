import { inngest } from "../client.js";
import { forEachAsync } from "es-toolkit/array";
import {
  buildWorkflowDeliveryKey,
  cancelReplacedWorkflowRuns,
  getWorkflowRunGuard,
  loadWorkflowCompiledPlan,
  loadWorkflowCorrelatedEntity,
  markWorkflowRunStatus,
  recordWorkflowDeliveryWithGuard,
  recordWorkflowRunStart,
} from "../../services/workflows/runtime.js";

type WorkflowExecutionDependencies = {
  recordRunStart: typeof recordWorkflowRunStart;
  cancelReplacedRuns: typeof cancelReplacedWorkflowRuns;
  getRunGuard: typeof getWorkflowRunGuard;
  loadCompiledPlan: typeof loadWorkflowCompiledPlan;
  loadCorrelatedEntity: typeof loadWorkflowCorrelatedEntity;
  recordDeliveryWithGuard: typeof recordWorkflowDeliveryWithGuard;
  markRunStatus: typeof markWorkflowRunStatus;
};

type TerminalReason = "entity_missing" | "unsupported_entity_type";
type ReplacementMode =
  | "replace_active"
  | "cancel_without_replacement"
  | "allow_parallel";

type ParsedCompiledPlan = {
  entryNodeIds: string[];
  nodeById: Map<string, Record<string, unknown>>;
  nextNodeIdsBySource: Map<string, string[]>;
};

function createDefaultDependencies(): WorkflowExecutionDependencies {
  return {
    recordRunStart: recordWorkflowRunStart,
    cancelReplacedRuns: cancelReplacedWorkflowRuns,
    getRunGuard: getWorkflowRunGuard,
    loadCompiledPlan: loadWorkflowCompiledPlan,
    loadCorrelatedEntity: loadWorkflowCorrelatedEntity,
    recordDeliveryWithGuard: recordWorkflowDeliveryWithGuard,
    markRunStatus: markWorkflowRunStatus,
  };
}

const REPLACEMENT_TRIGGER_MATCH_EXPRESSION =
  "event.data.entity.type == 'appointment' && async.data.entity.type == 'appointment' && async.id != event.id && event.data.orgId == async.data.orgId && event.data.workflow.definitionId == async.data.workflow.definitionId && event.data.entity.type == async.data.entity.type && event.data.entity.id == async.data.entity.id";
const WORKFLOW_SIDE_EFFECT_CHANNEL = "workflow.runtime";
const WORKFLOW_SIDE_EFFECT_STEP_ID = "workflow.execution.completed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeStepIdSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
  return normalized.length > 0 ? normalized : "node";
}

function parseCompiledPlan(
  value: Record<string, unknown> | null,
): ParsedCompiledPlan | null {
  if (!isRecord(value)) {
    return null;
  }

  const planVersion = value["planVersion"];
  const nodesValue = value["nodes"];
  const edgesValue = value["edges"];
  const entryValue = value["entryNodeIds"];

  if (
    typeof planVersion !== "number" ||
    !Array.isArray(nodesValue) ||
    !Array.isArray(edgesValue) ||
    !Array.isArray(entryValue)
  ) {
    return null;
  }

  const nodeById = new Map<string, Record<string, unknown>>();
  for (const rawNode of nodesValue) {
    if (!isRecord(rawNode)) continue;
    const nodeId = rawNode["id"];
    if (typeof nodeId !== "string" || nodeId.length === 0) continue;
    nodeById.set(nodeId, rawNode);
  }

  const nextNodeIdsBySource = new Map<string, string[]>();
  for (const rawEdge of edgesValue) {
    if (!isRecord(rawEdge)) continue;
    const source = rawEdge["source"];
    const target = rawEdge["target"];
    if (typeof source !== "string" || source.length === 0) continue;
    if (typeof target !== "string" || target.length === 0) continue;
    if (!nodeById.has(source) || !nodeById.has(target)) continue;

    const existing = nextNodeIdsBySource.get(source) ?? [];
    existing.push(target);
    nextNodeIdsBySource.set(source, existing);
  }

  for (const [source, targets] of nextNodeIdsBySource) {
    nextNodeIdsBySource.set(source, [...new Set(targets)].toSorted());
  }

  const entryNodeIds = entryValue
    .flatMap((entry) => (typeof entry === "string" ? [entry] : []))
    .filter((entry) => nodeById.has(entry));

  if (entryNodeIds.length === 0 && nodeById.size > 0) {
    return {
      entryNodeIds: [...nodeById.keys()].toSorted().slice(0, 1),
      nodeById,
      nextNodeIdsBySource,
    };
  }

  return {
    entryNodeIds,
    nodeById,
    nextNodeIdsBySource,
  };
}

function resolveReplacementMode(
  compiledPlan: Record<string, unknown> | null,
): ReplacementMode {
  if (!isRecord(compiledPlan)) {
    return "replace_active";
  }

  const trigger = compiledPlan["trigger"];
  if (!isRecord(trigger)) {
    return "replace_active";
  }

  const replacement = trigger["replacement"];
  if (!isRecord(replacement)) {
    return "replace_active";
  }

  const mode = replacement["mode"];
  if (
    mode === "replace_active" ||
    mode === "cancel_without_replacement" ||
    mode === "allow_parallel"
  ) {
    return mode;
  }

  return "replace_active";
}

function resolveWaitDuration(node: Record<string, unknown>): string | null {
  const wait = node["wait"];
  if (isRecord(wait)) {
    const duration = wait["duration"];
    if (typeof duration === "string" && duration.length > 0) {
      return duration;
    }
  }

  const duration = node["duration"];
  if (typeof duration === "string" && duration.length > 0) {
    return duration;
  }

  return null;
}

function resolveActionChannel(node: Record<string, unknown>): string {
  const channel = node["channel"];
  return typeof channel === "string" && channel.length > 0
    ? channel
    : WORKFLOW_SIDE_EFFECT_CHANNEL;
}

function resolveActionTarget(
  node: Record<string, unknown>,
  fallbackTarget: string,
): string {
  const target = node["target"];
  return typeof target === "string" && target.length > 0
    ? target
    : fallbackTarget;
}

function buildExecutionOrder(plan: ParsedCompiledPlan): string[] {
  const queue = [...plan.entryNodeIds];
  const visited = new Set<string>();
  const orderedNodeIds: string[] = [];

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (!currentNodeId || visited.has(currentNodeId)) {
      continue;
    }

    visited.add(currentNodeId);
    orderedNodeIds.push(currentNodeId);

    const nextNodeIds = plan.nextNodeIdsBySource.get(currentNodeId) ?? [];
    for (const nextNodeId of nextNodeIds) {
      if (!visited.has(nextNodeId)) {
        queue.push(nextNodeId);
      }
    }
  }

  return orderedNodeIds;
}

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

      const compiledPlanValue = await step.run(
        "load-workflow-compiled-plan",
        async () => {
          return dependencies.loadCompiledPlan({
            orgId: event.data.orgId,
            versionId: event.data.workflow.versionId,
          });
        },
      );
      const parsedCompiledPlan = parseCompiledPlan(compiledPlanValue);
      const replacementMode = resolveReplacementMode(compiledPlanValue);

      if (replacementMode !== "allow_parallel") {
        await step.run("cancel-replaced-runs", async () => {
          await dependencies.cancelReplacedRuns({
            orgId: event.data.orgId,
            definitionId: event.data.workflow.definitionId,
            entityType: event.data.entity.type,
            entityId: event.data.entity.id,
            replacementRunId: runId,
          });
        });
      }

      let status: "completed" | "cancelled" =
        replacementMode === "cancel_without_replacement"
          ? "cancelled"
          : "completed";
      let replacementSignal: unknown = null;
      let terminalReason: TerminalReason | null = null;

      if (status === "completed" && shouldWaitForReplacementSignal(event)) {
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

      const recordActionDelivery = async (input: {
        nodeId: string;
        channel: string;
        target: string;
      }): Promise<
        "recorded" | "duplicate" | "guard_blocked" | TerminalReason
      > => {
        const stepIdSuffix = normalizeStepIdSegment(input.nodeId);
        const correlatedEntity = await step.run(
          `load-correlated-entity-latest-${stepIdSuffix}`,
          async () => {
            return dependencies.loadCorrelatedEntity({
              orgId: event.data.orgId,
              entityType: event.data.entity.type,
              entityId: event.data.entity.id,
            });
          },
        );

        if (correlatedEntity.status !== "found") {
          return correlatedEntity.status === "missing"
            ? "entity_missing"
            : "unsupported_entity_type";
        }

        return step.run(
          `record-workflow-side-effect-delivery-${stepIdSuffix}`,
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
              stepId: input.nodeId,
              channel: input.channel,
              target: input.target,
            });

            return dependencies.recordDeliveryWithGuard({
              orgId: event.data.orgId,
              definitionId: event.data.workflow.definitionId,
              versionId: event.data.workflow.versionId,
              runId,
              expectedRunRevision: runGuard.runRevision,
              workflowType: event.data.workflow.workflowType,
              stepId: input.nodeId,
              channel: input.channel,
              target: input.target,
              deliveryKey,
            });
          },
        );
      };

      if (status === "completed") {
        if (parsedCompiledPlan === null) {
          const fallbackResult = await recordActionDelivery({
            nodeId: WORKFLOW_SIDE_EFFECT_STEP_ID,
            channel: WORKFLOW_SIDE_EFFECT_CHANNEL,
            target: `${event.data.entity.type}:${event.data.entity.id}`,
          });

          if (fallbackResult === "guard_blocked") {
            status = "cancelled";
          }

          if (
            fallbackResult === "entity_missing" ||
            fallbackResult === "unsupported_entity_type"
          ) {
            terminalReason = fallbackResult;
          }
        } else {
          let shouldStop = false;
          const orderedNodeIds = buildExecutionOrder(parsedCompiledPlan);

          await forEachAsync(
            orderedNodeIds,
            async (currentNodeId) => {
              if (
                shouldStop ||
                status !== "completed" ||
                terminalReason !== null
              ) {
                return;
              }

              const node = parsedCompiledPlan.nodeById.get(currentNodeId);
              if (!node) {
                return;
              }

              const nodeKind = node["kind"];
              if (nodeKind === "wait") {
                const waitDuration = resolveWaitDuration(node);
                if (waitDuration) {
                  await step.sleep(
                    `wait-for-duration-${normalizeStepIdSegment(currentNodeId)}`,
                    waitDuration,
                  );
                }

                return;
              }

              if (nodeKind === "terminal") {
                const terminalType = node["terminalType"];
                if (terminalType === "cancel") {
                  status = "cancelled";
                  shouldStop = true;
                  return;
                }

                if (terminalType === "complete") {
                  shouldStop = true;
                }

                return;
              }

              const actionResult = await recordActionDelivery({
                nodeId: currentNodeId,
                channel: resolveActionChannel(node),
                target: resolveActionTarget(
                  node,
                  `${event.data.entity.type}:${event.data.entity.id}`,
                ),
              });

              if (actionResult === "guard_blocked") {
                status = "cancelled";
                shouldStop = true;
                return;
              }

              if (
                actionResult === "entity_missing" ||
                actionResult === "unsupported_entity_type"
              ) {
                terminalReason = actionResult;
                shouldStop = true;
              }
            },
            { concurrency: 1 },
          );
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
