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
type RetryBackoffMode = "none" | "fixed" | "exponential";
type GuardOperator =
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "in"
  | "not_in"
  | "exists"
  | "not_exists";
type ParsedGuardCondition = {
  field: string;
  operator: GuardOperator;
  value?: unknown;
};
type ParsedGuard = {
  combinator: "all" | "any";
  conditions: ParsedGuardCondition[];
};

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

function isTerminalSourceEvent(eventType: string): boolean {
  return (
    eventType.endsWith(".cancelled") ||
    eventType.endsWith(".deleted") ||
    eventType.endsWith(".no_show")
  );
}

function resolveReplacementMode(
  compiledPlan: Record<string, unknown> | null,
  sourceEventType: string,
): ReplacementMode {
  const defaultMode = isTerminalSourceEvent(sourceEventType)
    ? "cancel_without_replacement"
    : "replace_active";

  if (!isRecord(compiledPlan)) {
    return defaultMode;
  }

  const trigger = compiledPlan["trigger"];
  if (!isRecord(trigger)) {
    return defaultMode;
  }

  const replacement = trigger["replacement"];
  if (!isRecord(replacement)) {
    return defaultMode;
  }

  const mode = replacement["mode"];
  if (
    mode === "replace_active" ||
    mode === "cancel_without_replacement" ||
    mode === "allow_parallel"
  ) {
    return mode;
  }

  const cancelOnTerminalState = replacement["cancelOnTerminalState"];
  if (typeof cancelOnTerminalState === "boolean") {
    if (cancelOnTerminalState && isTerminalSourceEvent(sourceEventType)) {
      return "cancel_without_replacement";
    }
    return "replace_active";
  }

  return defaultMode;
}

function parseDurationToMs(value: string): number | null {
  const parsed = value.match(
    /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
  );
  if (!parsed) {
    return null;
  }

  const weeks = parsed[1] ? Number(parsed[1]) : 0;
  const days = parsed[2] ? Number(parsed[2]) : 0;
  const hours = parsed[3] ? Number(parsed[3]) : 0;
  const minutes = parsed[4] ? Number(parsed[4]) : 0;
  const seconds = parsed[5] ? Number(parsed[5]) : 0;
  const totalDays = weeks * 7 + days;
  const totalMs =
    (((totalDays * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;

  return Number.isFinite(totalMs) && totalMs > 0 ? totalMs : null;
}

function normalizeFieldPath(field: string, entityType: string): string {
  const prefix = `${entityType}.`;
  return field.startsWith(prefix) ? field.slice(prefix.length) : field;
}

function getPathValue(source: Record<string, unknown>, path: string): unknown {
  if (path.length === 0) {
    return source;
  }

  const segments = path.split(".").filter((segment) => segment.length > 0);
  let current: unknown = source;

  for (const segment of segments) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

function parseIsoWithOffsetToMs(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  if (!/(?:[zZ]|[+-]\d{2}:\d{2})$/.test(value)) {
    return null;
  }

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function resolveNodeGuard(node: Record<string, unknown>): ParsedGuard | null {
  const guardValue = node["guard"];
  if (!isRecord(guardValue)) {
    return null;
  }

  const conditions = Array.isArray(guardValue["conditions"])
    ? guardValue["conditions"]
        .flatMap((rawCondition) => {
          if (!isRecord(rawCondition)) {
            return [];
          }

          const field = rawCondition["field"];
          const operator = rawCondition["operator"];
          if (typeof field !== "string" || field.length === 0) {
            return [];
          }

          if (
            operator !== "eq" &&
            operator !== "neq" &&
            operator !== "lt" &&
            operator !== "lte" &&
            operator !== "gt" &&
            operator !== "gte" &&
            operator !== "in" &&
            operator !== "not_in" &&
            operator !== "exists" &&
            operator !== "not_exists"
          ) {
            return [];
          }

          return [
            {
              field,
              operator,
              value: rawCondition["value"],
            } satisfies ParsedGuardCondition,
          ];
        })
        .filter((condition) => condition.field.length > 0)
    : [];

  if (conditions.length === 0) {
    return null;
  }

  return {
    combinator: guardValue["combinator"] === "any" ? "any" : "all",
    conditions,
  };
}

function valuesEqual(left: unknown, right: unknown): boolean {
  const leftTime = parseIsoWithOffsetToMs(left);
  const rightTime = parseIsoWithOffsetToMs(right);
  if (leftTime !== null && rightTime !== null) {
    return leftTime === rightTime;
  }

  return left === right;
}

function compareValues(left: unknown, right: unknown): number | null {
  const leftTime = parseIsoWithOffsetToMs(left);
  const rightTime = parseIsoWithOffsetToMs(right);
  if (leftTime !== null && rightTime !== null) {
    return leftTime - rightTime;
  }

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  if (typeof left === "string" && typeof right === "string") {
    return left.localeCompare(right);
  }

  return null;
}

function evaluateGuardCondition(
  condition: ParsedGuardCondition,
  input: { entityType: string; entity: Record<string, unknown> },
): boolean {
  const fieldValue = getPathValue(
    input.entity,
    normalizeFieldPath(condition.field, input.entityType),
  );

  if (condition.operator === "exists") {
    return fieldValue !== undefined && fieldValue !== null;
  }

  if (condition.operator === "not_exists") {
    return fieldValue === undefined || fieldValue === null;
  }

  if (condition.operator === "eq") {
    return valuesEqual(fieldValue, condition.value);
  }

  if (condition.operator === "neq") {
    return !valuesEqual(fieldValue, condition.value);
  }

  if (condition.operator === "in" || condition.operator === "not_in") {
    if (!Array.isArray(condition.value)) {
      return condition.operator === "not_in";
    }
    const included = condition.value.some((value) =>
      valuesEqual(fieldValue, value),
    );
    return condition.operator === "in" ? included : !included;
  }

  const comparison = compareValues(fieldValue, condition.value);
  if (comparison === null) {
    return false;
  }

  if (condition.operator === "lt") return comparison < 0;
  if (condition.operator === "lte") return comparison <= 0;
  if (condition.operator === "gt") return comparison > 0;
  if (condition.operator === "gte") return comparison >= 0;

  return false;
}

function evaluateGuard(
  guard: ParsedGuard | null,
  input: { entityType: string; entity: Record<string, unknown> },
): boolean {
  if (!guard) {
    return true;
  }

  const matches = guard.conditions.map((condition) =>
    evaluateGuardCondition(condition, input),
  );

  if (guard.combinator === "any") {
    return matches.some(Boolean);
  }

  return matches.every(Boolean);
}

function resolveRetryPolicy(compiledPlan: Record<string, unknown> | null): {
  attempts: number;
  backoff: RetryBackoffMode;
  baseDelayMs: number;
  maxDelayMs: number | null;
} {
  const defaults = {
    attempts: 10,
    backoff: "exponential" as const,
    baseDelayMs: 1000,
    maxDelayMs: null,
  };

  if (!isRecord(compiledPlan)) {
    return defaults;
  }

  const trigger = compiledPlan["trigger"];
  if (!isRecord(trigger)) {
    return defaults;
  }

  const retryPolicy = trigger["retryPolicy"];
  if (!isRecord(retryPolicy)) {
    return defaults;
  }

  const attempts = retryPolicy["attempts"];
  const backoff = retryPolicy["backoff"];
  const baseDelay = retryPolicy["baseDelay"];
  const maxDelay = retryPolicy["maxDelay"];

  return {
    attempts:
      typeof attempts === "number" &&
      Number.isInteger(attempts) &&
      attempts >= 1 &&
      attempts <= 20
        ? attempts
        : defaults.attempts,
    backoff:
      backoff === "none" || backoff === "fixed" || backoff === "exponential"
        ? backoff
        : defaults.backoff,
    baseDelayMs:
      typeof baseDelay === "string"
        ? (parseDurationToMs(baseDelay) ?? defaults.baseDelayMs)
        : defaults.baseDelayMs,
    maxDelayMs:
      typeof maxDelay === "string"
        ? (parseDurationToMs(maxDelay) ?? null)
        : null,
  };
}

export function computeRetryDelayMs(input: {
  attempt: number;
  backoff: RetryBackoffMode;
  baseDelayMs: number;
  maxDelayMs: number | null;
}): number {
  if (input.attempt <= 0 || input.backoff === "none") {
    return 0;
  }

  let delayMs =
    input.backoff === "fixed"
      ? input.baseDelayMs
      : input.baseDelayMs * 2 ** Math.max(0, input.attempt - 1);

  if (input.maxDelayMs !== null) {
    delayMs = Math.min(delayMs, input.maxDelayMs);
  }

  return Math.max(0, Math.floor(delayMs));
}

function resolveWaitDuration(
  node: Record<string, unknown>,
  correlatedEntity: {
    entityType: string;
    entity: Record<string, unknown>;
  } | null,
): string | null {
  const wait = node["wait"];
  let waitConfig: Record<string, unknown> | null = null;
  if (isRecord(wait)) {
    waitConfig = wait;
    const duration = wait["duration"];
    if (
      typeof duration === "string" &&
      duration.length > 0 &&
      typeof wait["referenceField"] === "string" &&
      wait["referenceField"].length > 0 &&
      correlatedEntity !== null
    ) {
      const durationMs = parseDurationToMs(duration);
      const referenceValue = getPathValue(
        correlatedEntity.entity,
        normalizeFieldPath(wait["referenceField"], correlatedEntity.entityType),
      );
      const referenceTimeMs = parseIsoWithOffsetToMs(referenceValue);

      if (durationMs !== null && referenceTimeMs !== null) {
        const direction =
          wait["offsetDirection"] === "before" ? "before" : "after";
        const targetMs =
          direction === "before"
            ? referenceTimeMs - durationMs
            : referenceTimeMs + durationMs;
        const delayMs = targetMs - Date.now();
        if (delayMs > 0) {
          return `${Math.floor(delayMs)}ms`;
        }
      }

      return null;
    }

    if (typeof duration === "string" && duration.length > 0) {
      return duration;
    }
  }

  const duration = node["duration"];
  if (typeof duration === "string" && duration.length > 0) {
    return duration;
  }

  if (waitConfig && typeof waitConfig["duration"] === "string") {
    return waitConfig["duration"];
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
      retries: 20,
      cancelOn: [
        {
          event: "scheduling/workflow.triggered",
          if: REPLACEMENT_TRIGGER_MATCH_EXPRESSION,
          timeout: "7d",
        },
      ],
    },
    { event: "scheduling/workflow.triggered" },
    async ({ event, runId, step, attempt }) => {
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
      const replacementMode = resolveReplacementMode(
        compiledPlanValue,
        event.data.sourceEvent.type,
      );
      const retryPolicy = resolveRetryPolicy(compiledPlanValue);
      const retryDelayMs = computeRetryDelayMs({
        attempt,
        backoff: retryPolicy.backoff,
        baseDelayMs: retryPolicy.baseDelayMs,
        maxDelayMs: retryPolicy.maxDelayMs,
      });

      if (attempt >= retryPolicy.attempts) {
        await step.run("mark-workflow-run-failed-retry-exhausted", async () => {
          await dependencies.markRunStatus({
            orgId: event.data.orgId,
            runId,
            status: "failed",
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
          status: "failed" as const,
          replacementSignalled: false,
          terminalReason: null,
        };
      }

      if (retryDelayMs > 0) {
        await step.sleep(
          `retry-policy-backoff-delay-${attempt}`,
          `${retryDelayMs}ms`,
        );
      }

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
        guard: ParsedGuard | null;
      }): Promise<
        | "recorded"
        | "duplicate"
        | "guard_blocked"
        | "guard_skipped"
        | TerminalReason
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

        if (
          !evaluateGuard(input.guard, {
            entityType: correlatedEntity.entityType,
            entity: correlatedEntity.entity,
          })
        ) {
          return "guard_skipped";
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
            guard: null,
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
                const waitStepIdSuffix = normalizeStepIdSegment(currentNodeId);
                const waitConfig = node["wait"];
                const needsReferenceField =
                  isRecord(waitConfig) &&
                  typeof waitConfig["referenceField"] === "string" &&
                  waitConfig["referenceField"].length > 0;
                let correlatedEntityForWait: {
                  entityType: string;
                  entity: Record<string, unknown>;
                } | null = null;

                if (needsReferenceField) {
                  const correlatedEntity = await step.run(
                    `load-correlated-entity-latest-for-wait-${waitStepIdSuffix}`,
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
                    shouldStop = true;
                    return;
                  }

                  correlatedEntityForWait = {
                    entityType: correlatedEntity.entityType,
                    entity: correlatedEntity.entity,
                  };
                }

                const waitDuration = resolveWaitDuration(
                  node,
                  correlatedEntityForWait,
                );
                if (waitDuration) {
                  await step.sleep(
                    `wait-for-duration-${waitStepIdSuffix}`,
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
                guard: resolveNodeGuard(node),
              });

              if (actionResult === "guard_blocked") {
                status = "cancelled";
                shouldStop = true;
                return;
              }

              if (actionResult === "guard_skipped") {
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
