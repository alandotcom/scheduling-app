import { forEachAsync } from "es-toolkit/array";
import { getLogger } from "@logtape/logtape";
import {
  linearJourneyGraphSchema,
  type LinearJourneyGraph,
  type JourneyTriggerConfig,
} from "@scheduling/dto";
import {
  journeyDeliveries,
  journeyRuns,
  orgs,
  journeys,
  journeyVersions,
} from "@scheduling/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { withOrg, type DbClient } from "../lib/db.js";
import { toRecord } from "../lib/type-guards.js";
import { customAttributeRepository } from "../repositories/custom-attributes.js";
import {
  sendJourneyActionExecuteForActionType,
  sendJourneyDeliveryCanceled,
  type JourneyDeliveryCanceledEventData,
  type JourneyDeliveryScheduledEventData,
} from "../inngest/runtime-events.js";
import { normalizeActionType } from "./delivery-dispatch-helpers.js";
import {
  deliveryActionTypes,
  getProviderForActionType,
} from "./delivery-provider-registry.js";
import { evaluateJourneyConditionExpression } from "./journey-condition-evaluator.js";
import {
  resolveReference,
  stringifyTemplateValue,
} from "./template-resolution.js";
import { evaluateJourneyTriggerFilter } from "./journey-trigger-filters.js";
import {
  appendJourneyRunEvent,
  upsertJourneyRunStepLog,
} from "./journey-run-artifacts.js";
import { refreshRunStatusTx } from "./journey-run-status.js";
import {
  resolveJourneyTriggerRuntime,
  type JourneyPlannerDomainEventPayload,
  type JourneyPlannerDomainEventType,
  type JourneyRunIdentity,
} from "./journey-trigger-engines.js";
import {
  loadFreshContextForPlannerByRun,
  loadFreshContextForPlannerByRunTx,
} from "./journey-template-context.js";
import { resolveWaitUntil } from "./workflow-wait-time.js";

export type { JourneyPlannerDomainEventType };

const ACTIVE_JOURNEY_STATES = ["published"] as const;
const ACTIVE_RUN_STATUSES = ["planned", "running"] as const;
const DEFAULT_ORG_TIMEZONE = "UTC";
const journeyPlannerLogger = getLogger(["journeys", "planner"]);

export type JourneyDomainEventEnvelope = {
  id: string;
  orgId: string;
  type: JourneyPlannerDomainEventType;
  payload: JourneyPlannerDomainEventPayload;
  timestamp: string;
};

type JourneyPlannerResult = {
  eventId: string;
  eventType: JourneyPlannerDomainEventType;
  orgId: string;
  plannedRunIds: string[];
  scheduledDeliveryIds: string[];
  canceledDeliveryIds: string[];
  skippedDeliveryIds: string[];
  ignoredJourneyIds: string[];
  erroredJourneyIds: string[];
};

type ScheduleRequester = (
  payload: JourneyDeliveryScheduledEventData,
) => Promise<{ eventId?: string }>;

type JourneyPlannerDependencies = {
  providerRequesters?: Record<string, ScheduleRequester>;
  cancelRequester?: (
    payload: JourneyDeliveryCanceledEventData,
  ) => Promise<{ eventId?: string }>;
  now?: Date;
  journeyIds?: readonly string[];
  modeOverride?: "live" | "test";
};

type JourneyRow = Pick<
  typeof journeys.$inferSelect,
  "id" | "name" | "state" | "mode"
>;

type JourneyVersionRow = Pick<
  typeof journeyVersions.$inferSelect,
  "id" | "journeyId" | "version" | "definitionSnapshot" | "publishedAt"
>;

type JourneyRunRow = typeof journeyRuns.$inferSelect;

type JourneyDeliveryRow = typeof journeyDeliveries.$inferSelect;

type PlannerFreshContext = {
  appointmentContext: Record<string, unknown>;
  clientContext: Record<string, unknown>;
  orgTimezone: string;
};

type PlannerRunContext = Pick<
  JourneyRunRow,
  | "id"
  | "status"
  | "triggerEntityType"
  | "triggerEntityId"
  | "appointmentId"
  | "clientId"
  | "journeyVersionSnapshot"
  | "journeyVersionId"
>;

type PlannerRunWithJourneyContext = PlannerRunContext & {
  journeyId: string | null;
};

type PlannedConfirmationTimeoutRow = {
  id: string;
  journeyRunId: string;
  deterministicKey: string;
  stepKey: string;
  scheduledFor: Date;
};

type DesiredDelivery = {
  actionType: string;
  deterministicKey: string;
  stepKey: string;
  channel: string;
  scheduledFor: Date;
  status: "planned" | "skipped";
  reasonCode: string | null;
};

type DesiredStepLog = {
  stepKey: string;
  nodeType: string;
  status: "pending" | "running" | "success" | "error" | "cancelled";
  startedAt: Date;
  completedAt?: Date | null;
  durationMs?: number | null;
  logInput?: Record<string, unknown> | null;
  logOutput?: Record<string, unknown> | null;
  error?: string | null;
};

type DesiredRunEvent = {
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
};

type ActionNode = LinearJourneyGraph["nodes"][number];
type JourneyEdge = LinearJourneyGraph["edges"][number];
type ConditionBranch = "true" | "false";
type TriggerBranch = "scheduled" | "canceled";
const knownActionTypes = new Set([
  "wait",
  "wait-for-confirmation",
  "condition",
  ...deliveryActionTypes,
]);

function getActionConfig(node: ActionNode): Record<string, unknown> {
  return toRecord(node.attributes.data.config);
}

function getNormalizedActionType(node: ActionNode): string | null {
  const config = getActionConfig(node);
  const normalized = normalizeActionType(config["actionType"]);
  return normalized && knownActionTypes.has(normalized) ? normalized : null;
}

function isJourneyDeliveryActionType(actionType: string | null): boolean {
  if (!actionType) {
    return false;
  }

  return getProviderForActionType(actionType) !== undefined;
}

function resolveChannel(actionType: string): string {
  const provider = getProviderForActionType(actionType);
  return provider?.channel ?? actionType;
}

function resolveReferenceValue(
  value: unknown,
  context: {
    appointmentContext: Record<string, unknown>;
    clientContext: Record<string, unknown>;
  },
): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("@")) {
    return value;
  }

  const resolved = resolveReference(trimmed, {
    appointment: context.appointmentContext,
    client: context.clientContext,
  });
  return resolved !== null && resolved !== undefined
    ? stringifyTemplateValue(resolved) || null
    : null;
}

function resolveWaitCursor(input: {
  node: ActionNode;
  cursor: Date;
  appointmentContext: Record<string, unknown>;
  clientContext: Record<string, unknown>;
}): Date {
  const config = getActionConfig(input.node);
  const waitTimezone =
    typeof config["waitTimezone"] === "string" ? config["waitTimezone"] : null;
  const waitUntil = resolveReferenceValue(config["waitUntil"], {
    appointmentContext: input.appointmentContext,
    clientContext: input.clientContext,
  });

  const waitResolutionInput: {
    now: Date;
    waitDuration?: unknown;
    waitUntil?: unknown;
    waitOffset?: unknown;
    waitTimezone?: string;
  } = {
    now: input.cursor,
    waitDuration: config["waitDuration"],
    waitUntil,
    waitOffset: config["waitOffset"],
  };

  if (waitTimezone) {
    waitResolutionInput.waitTimezone = waitTimezone;
  }

  const resolved = resolveWaitUntil(waitResolutionInput);

  return resolved.waitUntil ?? input.cursor;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function resolveAppointmentRequiresConfirmation(
  appointmentContext: Record<string, unknown>,
): boolean {
  const direct = toBoolean(appointmentContext["calendarRequiresConfirmation"]);
  if (direct !== null) {
    return direct;
  }

  const appointmentRecord = toRecord(appointmentContext["appointment"]);
  const nested = toBoolean(appointmentRecord["calendarRequiresConfirmation"]);
  return nested ?? false;
}

function resolveAppointmentStatus(
  appointmentContext: Record<string, unknown>,
): string | null {
  if (typeof appointmentContext["status"] === "string") {
    return appointmentContext["status"];
  }

  const appointmentRecord = toRecord(appointmentContext["appointment"]);
  return typeof appointmentRecord["status"] === "string"
    ? appointmentRecord["status"]
    : null;
}

function resolveAppointmentStartAt(
  appointmentContext: Record<string, unknown>,
): Date | null {
  const direct = appointmentContext["startAt"];
  if (typeof direct === "string") {
    const parsed = new Date(direct);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const appointmentRecord = toRecord(appointmentContext["appointment"]);
  const nested = appointmentRecord["startAt"];
  if (typeof nested !== "string") {
    return null;
  }

  const parsed = new Date(nested);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveWaitForConfirmationTimeoutAt(input: {
  appointmentContext: Record<string, unknown>;
  fallback: Date;
  graceMinutes: number;
}): Date {
  const appointmentStartAt = resolveAppointmentStartAt(
    input.appointmentContext,
  );
  if (!appointmentStartAt) {
    return input.fallback;
  }

  if (input.graceMinutes <= 0) {
    return appointmentStartAt;
  }

  return new Date(
    appointmentStartAt.getTime() + input.graceMinutes * 60 * 1000,
  );
}

function buildNodeById(graph: LinearJourneyGraph): Map<string, ActionNode> {
  const nodeById = new Map<string, ActionNode>();

  for (const node of graph.nodes) {
    nodeById.set(node.attributes.id, node);
  }

  return nodeById;
}

function buildOutgoingEdgesBySource(
  graph: LinearJourneyGraph,
): Map<string, JourneyEdge[]> {
  const outgoingEdgesBySource = new Map<string, JourneyEdge[]>();

  for (const edge of graph.edges) {
    const existing = outgoingEdgesBySource.get(edge.source) ?? [];
    existing.push(edge);
    outgoingEdgesBySource.set(edge.source, existing);
  }

  return outgoingEdgesBySource;
}

function getTriggerNode(graph: LinearJourneyGraph): ActionNode | null {
  return (
    graph.nodes.find((node) => node.attributes.data.type === "trigger") ?? null
  );
}

function normalizeConditionBranch(value: unknown): ConditionBranch | null {
  if (typeof value !== "string") {
    return null;
  }

  let normalized = value.trim().toLowerCase();
  if (normalized.startsWith("branch-")) {
    normalized = normalized.slice("branch-".length);
  }

  if (normalized === "true" || normalized === "false") {
    return normalized;
  }

  return null;
}

function getConditionBranchFromEdge(edge: JourneyEdge): ConditionBranch | null {
  const attributes = toRecord(edge.attributes);
  const data = toRecord(attributes["data"]);

  return (
    normalizeConditionBranch(data["conditionBranch"]) ??
    normalizeConditionBranch(attributes["label"]) ??
    normalizeConditionBranch(attributes["sourceHandle"])
  );
}

function resolveDefaultNextNodeIds(input: {
  sourceNodeId: string;
  outgoingEdgesBySource: Map<string, JourneyEdge[]>;
}): string[] {
  const outgoingEdges =
    input.outgoingEdgesBySource.get(input.sourceNodeId) ?? [];
  return outgoingEdges.map((edge) => edge.target);
}

function resolveConditionNextNodeId(input: {
  sourceNodeId: string;
  branch: ConditionBranch;
  outgoingEdgesBySource: Map<string, JourneyEdge[]>;
}): string | null {
  const outgoingEdges =
    input.outgoingEdgesBySource.get(input.sourceNodeId) ?? [];
  const matchingEdge = outgoingEdges.find(
    (edge) => getConditionBranchFromEdge(edge) === input.branch,
  );
  return matchingEdge?.target ?? null;
}

function normalizeTriggerBranch(value: unknown): TriggerBranch | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "scheduled" || normalized === "canceled") {
    return normalized;
  }

  return null;
}

function getTriggerBranchFromEdge(edge: JourneyEdge): TriggerBranch | null {
  const attributes = toRecord(edge.attributes);
  const data = toRecord(attributes["data"]);

  return (
    normalizeTriggerBranch(data["triggerBranch"]) ??
    normalizeTriggerBranch(attributes["label"]) ??
    normalizeTriggerBranch(attributes["sourceHandle"])
  );
}

function resolveTriggerNextNodeIds(input: {
  sourceNodeId: string;
  branch: TriggerBranch;
  outgoingEdgesBySource: Map<string, JourneyEdge[]>;
}): string[] {
  const outgoingEdges =
    input.outgoingEdgesBySource.get(input.sourceNodeId) ?? [];

  const matchingTargets: string[] = [];
  let hasBranchLabels = false;

  for (const edge of outgoingEdges) {
    const branch = getTriggerBranchFromEdge(edge);
    if (!branch) {
      continue;
    }

    hasBranchLabels = true;
    if (branch === input.branch) {
      matchingTargets.push(edge.target);
    }
  }

  if (!hasBranchLabels) {
    // Backwards compat: no branch labels → "scheduled" gets all edges, "canceled" gets none
    if (input.branch === "scheduled") {
      return outgoingEdges.map((edge) => edge.target);
    }
    return [];
  }

  return matchingTargets;
}

function getConditionExpression(node: ActionNode): unknown {
  const config = getActionConfig(node);
  return config["expression"];
}

function resolveConditionNextNodeIdForContext(input: {
  node: ActionNode;
  outgoingEdgesBySource: Map<string, JourneyEdge[]>;
  appointmentContext: Record<string, unknown>;
  clientContext: Record<string, unknown>;
  journeyId: string;
  triggerEntityId: string;
  now: Date;
  orgTimezone: string;
}): {
  nextNodeId: string | null;
  matched: boolean;
  error: { code: string; message: string } | null;
} {
  const conditionResult = evaluateJourneyConditionExpression({
    expression: getConditionExpression(input.node),
    context: {
      appointment: input.appointmentContext,
      client: input.clientContext,
    },
    now: input.now,
    orgTimezone: input.orgTimezone,
  });

  if (conditionResult.error) {
    journeyPlannerLogger.error(
      "Journey condition evaluation failed for journey {journeyId} node {nodeId} entity {triggerEntityId}: {errorCode} {errorMessage}",
      {
        journeyId: input.journeyId,
        nodeId: input.node.attributes.id,
        triggerEntityId: input.triggerEntityId,
        errorCode: conditionResult.error.code,
        errorMessage: conditionResult.error.message,
      },
    );
  }

  const branch: ConditionBranch = conditionResult.matched ? "true" : "false";
  return {
    nextNodeId: resolveConditionNextNodeId({
      sourceNodeId: input.node.attributes.id,
      branch,
      outgoingEdgesBySource: input.outgoingEdgesBySource,
    }),
    matched: conditionResult.matched,
    error: conditionResult.error ?? null,
  };
}

function buildDeliveryDeterministicKey(input: {
  journeyRunId: string;
  stepKey: string;
  scheduledFor: Date;
}): string {
  return `${input.journeyRunId}:${input.stepKey}:${input.scheduledFor.toISOString()}`;
}

function resolveInvalidTrackedAttributeReason(input: {
  triggerConfig: JourneyTriggerConfig;
  validClientAttributeKeys: Set<string> | null;
}): string | null {
  if (
    input.triggerConfig.triggerType !== "ClientJourney" ||
    input.triggerConfig.event !== "client.updated"
  ) {
    return null;
  }

  const trackedAttributeKey = input.triggerConfig.trackedAttributeKey?.trim();
  if (!trackedAttributeKey) {
    return 'missing required "trackedAttributeKey"';
  }

  if (!input.validClientAttributeKeys?.has(trackedAttributeKey)) {
    return `unknown tracked attribute key "${trackedAttributeKey}"`;
  }

  return null;
}

function buildDesiredDeliveries(input: {
  graph: LinearJourneyGraph;
  journeyRunId: string;
  journeyId: string;
  appointmentId: string | null;
  triggerEntityId: string;
  appointmentContext: Record<string, unknown>;
  clientContext: Record<string, unknown>;
  eventType?: JourneyPlannerDomainEventType;
  eventTimestamp?: string;
  now: Date;
  orgTimezone: string;
  startAfterNodeId?: string;
  triggerBranch?: TriggerBranch;
}): {
  desiredDeliveries: DesiredDelivery[];
  desiredStepLogs: DesiredStepLog[];
  desiredRunEvents: DesiredRunEvent[];
} {
  const nodeById = buildNodeById(input.graph);
  const outgoingEdgesBySource = buildOutgoingEdgesBySource(input.graph);
  const desiredDeliveries: DesiredDelivery[] = [];
  const desiredStepLogs: DesiredStepLog[] = [];
  const desiredRunEvents: DesiredRunEvent[] = [];
  const visitedNodeIds = new Set<string>();

  let pending: Array<{ nodeId: string; cursor: Date }>;

  if (input.startAfterNodeId) {
    // Resume: start from successors of the given node
    visitedNodeIds.add(input.startAfterNodeId);
    pending = resolveDefaultNextNodeIds({
      sourceNodeId: input.startAfterNodeId,
      outgoingEdgesBySource,
    }).map((nodeId) => ({
      nodeId,
      cursor: input.now,
    }));
  } else {
    // Normal: start from trigger node
    const triggerNode = getTriggerNode(input.graph);
    if (!triggerNode) {
      return { desiredDeliveries, desiredStepLogs, desiredRunEvents };
    }

    const initialCursor = input.eventTimestamp
      ? new Date(input.eventTimestamp)
      : input.now;
    const startCursor = Number.isNaN(initialCursor.getTime())
      ? input.now
      : initialCursor;

    desiredStepLogs.push({
      stepKey: triggerNode.attributes.id,
      nodeType: "trigger",
      status: "success",
      startedAt: startCursor,
      completedAt: startCursor,
      durationMs: 0,
      logInput: {
        eventType: input.eventType ?? null,
        appointmentId: input.appointmentId,
      },
      logOutput: {
        routed: true,
      },
      error: null,
    });

    pending = resolveTriggerNextNodeIds({
      sourceNodeId: triggerNode.attributes.id,
      branch: input.triggerBranch ?? "scheduled",
      outgoingEdgesBySource,
    }).map((nodeId) => ({
      nodeId,
      cursor: startCursor,
    }));
  }

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) {
      continue;
    }

    const currentNodeId = current.nodeId;
    if (visitedNodeIds.has(currentNodeId)) {
      continue;
    }
    visitedNodeIds.add(currentNodeId);

    const node = nodeById.get(currentNodeId);
    if (!node) {
      continue;
    }

    const actionType = getNormalizedActionType(node);

    if (actionType === "wait") {
      const config = getActionConfig(node);
      const nextCursor = resolveWaitCursor({
        node,
        cursor: current.cursor,
        appointmentContext: input.appointmentContext,
        clientContext: input.clientContext,
      });
      const isWaiting = nextCursor.getTime() > input.now.getTime();
      desiredStepLogs.push({
        stepKey: node.attributes.id,
        nodeType: "wait",
        status: isWaiting ? "running" : "success",
        startedAt: current.cursor,
        completedAt: isWaiting ? null : nextCursor,
        durationMs: isWaiting
          ? null
          : Math.max(0, nextCursor.getTime() - current.cursor.getTime()),
        logInput: {
          waitDuration: config["waitDuration"] ?? null,
          waitUntil: config["waitUntil"] ?? null,
          waitOffset: config["waitOffset"] ?? null,
          waitTimezone: config["waitTimezone"] ?? null,
          cursor: current.cursor.toISOString(),
        },
        logOutput: {
          waitUntil: nextCursor.toISOString(),
        },
        error: null,
      });
      if (isWaiting) {
        desiredRunEvents.push({
          eventType: "run_waiting",
          message: `Run waiting in delay node '${node.attributes.data.label || "Wait"}'`,
          metadata: {
            stepKey: node.attributes.id,
            waitUntil: nextCursor.toISOString(),
          },
        });
        // Stop at active wait boundary — emit a wait-resume delivery
        // that will re-plan from this point with fresh data when it fires.
        desiredDeliveries.push({
          actionType: "wait-resume",
          deterministicKey: buildDeliveryDeterministicKey({
            journeyRunId: input.journeyRunId,
            stepKey: node.attributes.id,
            scheduledFor: nextCursor,
          }),
          stepKey: node.attributes.id,
          channel: "internal",
          scheduledFor: nextCursor,
          status: "planned",
          reasonCode: null,
        });
        continue;
      }
      // Wait already elapsed — continue walking with snapshot data
      for (const nextNodeId of resolveDefaultNextNodeIds({
        sourceNodeId: node.attributes.id,
        outgoingEdgesBySource,
      })) {
        pending.push({ nodeId: nextNodeId, cursor: nextCursor });
      }
      continue;
    }

    if (actionType === "wait-for-confirmation") {
      const config = getActionConfig(node);
      const confirmationGraceMinutes = Math.max(
        0,
        Math.floor(toNumber(config["confirmationGraceMinutes"]) ?? 0),
      );
      const requiresConfirmation = resolveAppointmentRequiresConfirmation(
        input.appointmentContext,
      );
      const appointmentStatus = resolveAppointmentStatus(
        input.appointmentContext,
      );
      const isAlreadyConfirmed = appointmentStatus === "confirmed";

      if (!requiresConfirmation || isAlreadyConfirmed) {
        desiredStepLogs.push({
          stepKey: node.attributes.id,
          nodeType: "wait-for-confirmation",
          status: "success",
          startedAt: current.cursor,
          completedAt: current.cursor,
          durationMs: 0,
          logInput: {
            requiresConfirmation,
            appointmentStatus,
            confirmationGraceMinutes,
          },
          logOutput: {
            continued: true,
            reasonCode: !requiresConfirmation
              ? "confirmation_not_required"
              : "already_confirmed",
          },
          error: null,
        });

        for (const nextNodeId of resolveDefaultNextNodeIds({
          sourceNodeId: node.attributes.id,
          outgoingEdgesBySource,
        })) {
          pending.push({ nodeId: nextNodeId, cursor: current.cursor });
        }
        continue;
      }

      const timeoutAt = resolveWaitForConfirmationTimeoutAt({
        appointmentContext: input.appointmentContext,
        fallback: current.cursor,
        graceMinutes: confirmationGraceMinutes,
      });

      desiredStepLogs.push({
        stepKey: node.attributes.id,
        nodeType: "wait-for-confirmation",
        status: "running",
        startedAt: current.cursor,
        completedAt: null,
        durationMs: null,
        logInput: {
          requiresConfirmation,
          appointmentStatus,
          confirmationGraceMinutes,
          cursor: current.cursor.toISOString(),
        },
        logOutput: {
          waitUntil: timeoutAt.toISOString(),
        },
        error: null,
      });
      desiredRunEvents.push({
        eventType: "run_waiting_confirmation",
        message: `Run waiting for appointment confirmation in '${node.attributes.data.label || "Wait For Confirmation"}'`,
        metadata: {
          stepKey: node.attributes.id,
          waitUntil: timeoutAt.toISOString(),
          confirmationGraceMinutes,
        },
      });
      desiredDeliveries.push({
        actionType: "wait-for-confirmation-timeout",
        deterministicKey: buildDeliveryDeterministicKey({
          journeyRunId: input.journeyRunId,
          stepKey: node.attributes.id,
          scheduledFor: timeoutAt,
        }),
        stepKey: node.attributes.id,
        channel: "internal",
        scheduledFor: timeoutAt,
        status: "planned",
        reasonCode: null,
      });
      continue;
    }

    if (actionType === "condition") {
      const conditionResult = resolveConditionNextNodeIdForContext({
        node,
        outgoingEdgesBySource,
        appointmentContext: input.appointmentContext,
        clientContext: input.clientContext,
        journeyId: input.journeyId,
        triggerEntityId: input.triggerEntityId,
        now: input.now,
        orgTimezone: input.orgTimezone,
      });
      desiredStepLogs.push({
        stepKey: node.attributes.id,
        nodeType: "condition",
        status: conditionResult.error ? "error" : "success",
        startedAt: current.cursor,
        completedAt: current.cursor,
        durationMs: 0,
        logInput: {
          expression: getConditionExpression(node),
        },
        logOutput: {
          matched: conditionResult.matched,
          nextNodeId: conditionResult.nextNodeId,
        },
        error: conditionResult.error?.message ?? null,
      });
      if (conditionResult.nextNodeId) {
        pending.push({
          nodeId: conditionResult.nextNodeId,
          cursor: current.cursor,
        });
      }
      continue;
    }

    if (!actionType || !isJourneyDeliveryActionType(actionType)) {
      for (const nextNodeId of resolveDefaultNextNodeIds({
        sourceNodeId: node.attributes.id,
        outgoingEdgesBySource,
      })) {
        pending.push({ nodeId: nextNodeId, cursor: current.cursor });
      }
      continue;
    }

    const scheduledFor = new Date(current.cursor);
    desiredDeliveries.push({
      actionType,
      deterministicKey: buildDeliveryDeterministicKey({
        journeyRunId: input.journeyRunId,
        stepKey: node.attributes.id,
        scheduledFor,
      }),
      stepKey: node.attributes.id,
      channel: resolveChannel(actionType),
      scheduledFor,
      status: "planned",
      reasonCode: null,
    });
    desiredStepLogs.push({
      stepKey: node.attributes.id,
      nodeType: actionType,
      status: "pending",
      startedAt: scheduledFor,
      completedAt: null,
      durationMs: null,
      logInput: {
        channel: resolveChannel(actionType),
      },
      logOutput: {
        scheduledFor: scheduledFor.toISOString(),
        status: "planned",
        reasonCode: null,
      },
      error: null,
    });

    for (const nextNodeId of resolveDefaultNextNodeIds({
      sourceNodeId: node.attributes.id,
      outgoingEdgesBySource,
    })) {
      pending.push({ nodeId: nextNodeId, cursor: current.cursor });
    }
  }

  return {
    desiredDeliveries,
    desiredStepLogs,
    desiredRunEvents,
  };
}

async function findJourneyRun(input: {
  tx: DbClient;
  journeyVersionId: string;
  runIdentity: JourneyRunIdentity;
  mode: "live" | "test";
}): Promise<JourneyRunRow | null> {
  const [run] = await input.tx
    .select()
    .from(journeyRuns)
    .where(
      and(
        eq(journeyRuns.journeyVersionId, input.journeyVersionId),
        eq(journeyRuns.triggerEntityType, input.runIdentity.triggerEntityType),
        eq(journeyRuns.triggerEntityId, input.runIdentity.triggerEntityId),
        eq(journeyRuns.mode, input.mode),
      ),
    )
    .limit(1);

  return run ?? null;
}

async function findOrCreateJourneyRun(input: {
  tx: DbClient;
  orgId: string;
  journey: JourneyRow;
  journeyVersion: JourneyVersionRow;
  runIdentity: JourneyRunIdentity;
  mode: "live" | "test";
}): Promise<{ run: JourneyRunRow; created: boolean }> {
  const existing = await findJourneyRun({
    tx: input.tx,
    journeyVersionId: input.journeyVersion.id,
    runIdentity: input.runIdentity,
    mode: input.mode,
  });

  if (existing) {
    return {
      run: existing,
      created: false,
    };
  }

  const [created] = await input.tx
    .insert(journeyRuns)
    .values({
      orgId: input.orgId,
      journeyVersionId: input.journeyVersion.id,
      triggerEntityType: input.runIdentity.triggerEntityType,
      triggerEntityId: input.runIdentity.triggerEntityId,
      appointmentId: input.runIdentity.appointmentId,
      clientId: input.runIdentity.clientId,
      mode: input.mode,
      status: "planned",
      journeyNameSnapshot: input.journey.name,
      journeyVersionSnapshot: {
        version: input.journeyVersion.version,
        definitionSnapshot: input.journeyVersion.definitionSnapshot,
        publishedAt: input.journeyVersion.publishedAt.toISOString(),
      },
    })
    .onConflictDoNothing()
    .returning();

  if (created) {
    return {
      run: created,
      created: true,
    };
  }

  const resolved = await findJourneyRun({
    tx: input.tx,
    journeyVersionId: input.journeyVersion.id,
    runIdentity: input.runIdentity,
    mode: input.mode,
  });

  if (!resolved) {
    throw new Error("Failed to resolve journey run after upsert.");
  }

  return {
    run: resolved,
    created: false,
  };
}

async function loadPlannerRunByIdTx(input: {
  tx: DbClient;
  journeyRunId: string;
}): Promise<PlannerRunWithJourneyContext | null> {
  const [row] = await input.tx
    .select({
      id: journeyRuns.id,
      status: journeyRuns.status,
      triggerEntityType: journeyRuns.triggerEntityType,
      triggerEntityId: journeyRuns.triggerEntityId,
      appointmentId: journeyRuns.appointmentId,
      clientId: journeyRuns.clientId,
      journeyVersionSnapshot: journeyRuns.journeyVersionSnapshot,
      journeyVersionId: journeyRuns.journeyVersionId,
      journeyId: journeyVersions.journeyId,
    })
    .from(journeyRuns)
    .leftJoin(
      journeyVersions,
      eq(journeyVersions.id, journeyRuns.journeyVersionId),
    )
    .where(eq(journeyRuns.id, input.journeyRunId))
    .limit(1);

  return row ?? null;
}

function parseGraphFromRunSnapshot(input: {
  runId: string;
  journeyVersionSnapshot: JourneyRunRow["journeyVersionSnapshot"];
  logPrefix: string;
}): LinearJourneyGraph | null {
  const snapshotRecord = toRecord(input.journeyVersionSnapshot);
  const parsedGraph = linearJourneyGraphSchema.safeParse(
    snapshotRecord["definitionSnapshot"],
  );

  if (!parsedGraph.success) {
    journeyPlannerLogger.error(
      "{prefix}: failed to parse graph for run {runId}",
      {
        prefix: input.logPrefix,
        runId: input.runId,
      },
    );
    return null;
  }

  return parsedGraph.data;
}

async function findPlannedConfirmationTimeoutByJourneyTx(input: {
  tx: DbClient;
  journeyId: string;
  appointmentId: string;
  mode: "live" | "test";
}): Promise<{
  run: PlannerRunWithJourneyContext;
  timeoutDelivery: PlannedConfirmationTimeoutRow;
} | null> {
  const [row] = await input.tx
    .select({
      runId: journeyRuns.id,
      runStatus: journeyRuns.status,
      triggerEntityType: journeyRuns.triggerEntityType,
      triggerEntityId: journeyRuns.triggerEntityId,
      appointmentId: journeyRuns.appointmentId,
      clientId: journeyRuns.clientId,
      journeyVersionSnapshot: journeyRuns.journeyVersionSnapshot,
      journeyVersionId: journeyRuns.journeyVersionId,
      runJourneyId: journeyVersions.journeyId,
      timeoutId: journeyDeliveries.id,
      timeoutJourneyRunId: journeyDeliveries.journeyRunId,
      timeoutDeterministicKey: journeyDeliveries.deterministicKey,
      timeoutStepKey: journeyDeliveries.stepKey,
      timeoutScheduledFor: journeyDeliveries.scheduledFor,
    })
    .from(journeyDeliveries)
    .innerJoin(journeyRuns, eq(journeyRuns.id, journeyDeliveries.journeyRunId))
    .leftJoin(
      journeyVersions,
      eq(journeyVersions.id, journeyRuns.journeyVersionId),
    )
    .where(
      and(
        eq(journeyVersions.journeyId, input.journeyId),
        eq(journeyRuns.triggerEntityType, "appointment"),
        eq(journeyRuns.triggerEntityId, input.appointmentId),
        eq(journeyRuns.mode, input.mode),
        inArray(journeyRuns.status, [...ACTIVE_RUN_STATUSES]),
        eq(journeyDeliveries.status, "planned"),
        eq(journeyDeliveries.actionType, "wait-for-confirmation-timeout"),
      ),
    )
    .orderBy(asc(journeyDeliveries.scheduledFor), asc(journeyDeliveries.id))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    run: {
      id: row.runId,
      status: row.runStatus,
      triggerEntityType: row.triggerEntityType,
      triggerEntityId: row.triggerEntityId,
      appointmentId: row.appointmentId,
      clientId: row.clientId,
      journeyVersionSnapshot: row.journeyVersionSnapshot,
      journeyVersionId: row.journeyVersionId,
      journeyId: row.runJourneyId,
    },
    timeoutDelivery: {
      id: row.timeoutId,
      journeyRunId: row.timeoutJourneyRunId,
      deterministicKey: row.timeoutDeterministicKey,
      stepKey: row.timeoutStepKey,
      scheduledFor: row.timeoutScheduledFor,
    },
  };
}

async function markRunCanceled(input: {
  tx: DbClient;
  runId: string;
}): Promise<void> {
  await input.tx
    .update(journeyRuns)
    .set({
      status: "canceled",
      cancelledAt: sql`now()`,
    })
    .where(
      and(
        eq(journeyRuns.id, input.runId),
        inArray(journeyRuns.status, [...ACTIVE_RUN_STATUSES]),
      ),
    );
}

async function markRunPlanned(input: {
  tx: DbClient;
  runId: string;
}): Promise<void> {
  await input.tx
    .update(journeyRuns)
    .set({
      status: "planned",
      cancelledAt: null,
    })
    .where(eq(journeyRuns.id, input.runId));
}

async function listDeliveriesForRun(
  tx: DbClient,
  runId: string,
): Promise<JourneyDeliveryRow[]> {
  return tx
    .select()
    .from(journeyDeliveries)
    .where(eq(journeyDeliveries.journeyRunId, runId));
}

type PendingInngestEvent =
  | {
      type: "schedule";
      actionType: string;
      payload: JourneyDeliveryScheduledEventData;
    }
  | { type: "cancel"; payload: JourneyDeliveryCanceledEventData };

async function cancelPendingDeliveries(input: {
  tx: DbClient;
  runId: string;
  reasonCode: string;
  orgId: string;
}): Promise<{ canceledIds: string[]; pendingEvents: PendingInngestEvent[] }> {
  const [plannedRows, runRows] = await Promise.all([
    input.tx
      .select({
        id: journeyDeliveries.id,
        stepKey: journeyDeliveries.stepKey,
        scheduledFor: journeyDeliveries.scheduledFor,
      })
      .from(journeyDeliveries)
      .where(
        and(
          eq(journeyDeliveries.journeyRunId, input.runId),
          eq(journeyDeliveries.status, "planned"),
        ),
      ),
    input.tx
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, input.runId))
      .limit(1),
  ]);

  if (plannedRows.length === 0) {
    await markRunCanceled({
      tx: input.tx,
      runId: input.runId,
    });
    return { canceledIds: [], pendingEvents: [] };
  }

  const plannedIds = plannedRows.map((row) => row.id);
  const canceled = await input.tx
    .update(journeyDeliveries)
    .set({
      status: "canceled",
      reasonCode: input.reasonCode,
      updatedAt: sql`now()`,
    })
    .where(inArray(journeyDeliveries.id, plannedIds))
    .returning({
      id: journeyDeliveries.id,
      deterministicKey: journeyDeliveries.deterministicKey,
      journeyRunId: journeyDeliveries.journeyRunId,
      stepKey: journeyDeliveries.stepKey,
      scheduledFor: journeyDeliveries.scheduledFor,
    });

  await markRunCanceled({
    tx: input.tx,
    runId: input.runId,
  });

  const runId = runRows[0]?.id ?? input.runId;
  const pendingEvents: PendingInngestEvent[] = [];

  await forEachAsync(
    canceled,
    async (delivery) => {
      await upsertJourneyRunStepLog({
        tx: input.tx,
        orgId: input.orgId,
        runId: delivery.journeyRunId,
        stepKey: delivery.stepKey,
        nodeType: "delivery",
        status: "cancelled",
        startedAt: delivery.scheduledFor,
        completedAt: delivery.scheduledFor,
        durationMs: 0,
        logOutput: {
          status: "canceled",
          reasonCode: input.reasonCode,
        },
      });
      pendingEvents.push({
        type: "cancel",
        payload: {
          orgId: input.orgId,
          journeyDeliveryId: delivery.id,
          journeyRunId: runId,
          deterministicKey: delivery.deterministicKey,
          reasonCode: input.reasonCode,
        },
      });
    },
    { concurrency: 1 },
  );

  await appendJourneyRunEvent({
    tx: input.tx,
    orgId: input.orgId,
    runId: input.runId,
    eventType: "run_canceled",
    message: "Run canceled",
    metadata: {
      reasonCode: input.reasonCode,
      canceledDeliveryCount: canceled.length,
    },
  });

  return {
    canceledIds: canceled.map((delivery) => delivery.id),
    pendingEvents,
  };
}

async function reconcileDeliveries(input: {
  tx: DbClient;
  runId: string;
  orgId: string;
  desiredDeliveries: DesiredDelivery[];
  desiredStepLogs: DesiredStepLog[];
  desiredRunEvents: DesiredRunEvent[];
}): Promise<{
  scheduledDeliveryIds: string[];
  canceledDeliveryIds: string[];
  skippedDeliveryIds: string[];
  pendingInngestEvents: PendingInngestEvent[];
}> {
  // Write all step logs and run events from the build phase first
  await forEachAsync(
    input.desiredStepLogs,
    async (stepLog) => {
      await upsertJourneyRunStepLog({
        tx: input.tx,
        orgId: input.orgId,
        runId: input.runId,
        stepKey: stepLog.stepKey,
        nodeType: stepLog.nodeType,
        status: stepLog.status,
        startedAt: stepLog.startedAt,
        completedAt: stepLog.completedAt,
        durationMs: stepLog.durationMs,
        logInput: stepLog.logInput,
        logOutput: stepLog.logOutput,
        error: stepLog.error,
      });
    },
    { concurrency: 1 },
  );

  await forEachAsync(
    input.desiredRunEvents,
    async (runEvent) => {
      await appendJourneyRunEvent({
        tx: input.tx,
        orgId: input.orgId,
        runId: input.runId,
        eventType: runEvent.eventType,
        message: runEvent.message,
        metadata: runEvent.metadata,
      });
    },
    { concurrency: 1 },
  );

  const existingDeliveries = await listDeliveriesForRun(input.tx, input.runId);
  const existingByDeterministicKey = new Map(
    existingDeliveries.map((delivery) => [delivery.deterministicKey, delivery]),
  );
  const desiredKeys = new Set(
    input.desiredDeliveries.map((delivery) => delivery.deterministicKey),
  );

  const stalePlannedIds = existingDeliveries
    .filter(
      (delivery) =>
        delivery.status === "planned" &&
        !desiredKeys.has(delivery.deterministicKey),
    )
    .map((delivery) => delivery.id);

  const staleCanceled =
    stalePlannedIds.length === 0
      ? []
      : await input.tx
          .update(journeyDeliveries)
          .set({
            status: "canceled",
            reasonCode: "execution_terminal",
            updatedAt: sql`now()`,
          })
          .where(inArray(journeyDeliveries.id, stalePlannedIds))
          .returning({
            id: journeyDeliveries.id,
            journeyRunId: journeyDeliveries.journeyRunId,
            deterministicKey: journeyDeliveries.deterministicKey,
            stepKey: journeyDeliveries.stepKey,
            scheduledFor: journeyDeliveries.scheduledFor,
          });

  const pendingInngestEvents: PendingInngestEvent[] = [];

  await forEachAsync(
    staleCanceled,
    async (delivery) => {
      await upsertJourneyRunStepLog({
        tx: input.tx,
        orgId: input.orgId,
        runId: delivery.journeyRunId,
        stepKey: delivery.stepKey,
        nodeType: "delivery",
        status: "cancelled",
        startedAt: delivery.scheduledFor,
        completedAt: delivery.scheduledFor,
        durationMs: 0,
        logOutput: {
          status: "canceled",
          reasonCode: "execution_terminal",
        },
      });
      pendingInngestEvents.push({
        type: "cancel",
        payload: {
          orgId: input.orgId,
          journeyDeliveryId: delivery.id,
          journeyRunId: delivery.journeyRunId,
          deterministicKey: delivery.deterministicKey,
          reasonCode: "execution_terminal",
        },
      });
    },
    { concurrency: 1 },
  );

  const scheduledDeliveryIds: string[] = [];
  const skippedDeliveryIds: string[] = [];

  await forEachAsync(
    input.desiredDeliveries,
    async (desired) => {
      const existing = existingByDeterministicKey.get(desired.deterministicKey);
      if (existing) {
        return;
      }

      const [created] = await input.tx
        .insert(journeyDeliveries)
        .values({
          orgId: input.orgId,
          journeyRunId: input.runId,
          stepKey: desired.stepKey,
          channel: desired.channel,
          actionType: desired.actionType,
          scheduledFor: desired.scheduledFor,
          status: desired.status,
          reasonCode: desired.reasonCode,
          deterministicKey: desired.deterministicKey,
        })
        .returning({
          id: journeyDeliveries.id,
          journeyRunId: journeyDeliveries.journeyRunId,
          deterministicKey: journeyDeliveries.deterministicKey,
          stepKey: journeyDeliveries.stepKey,
          channel: journeyDeliveries.channel,
          actionType: journeyDeliveries.actionType,
          scheduledFor: journeyDeliveries.scheduledFor,
          status: journeyDeliveries.status,
          reasonCode: journeyDeliveries.reasonCode,
        });

      if (!created) {
        return;
      }

      if (created.status === "planned") {
        await upsertJourneyRunStepLog({
          tx: input.tx,
          orgId: input.orgId,
          runId: created.journeyRunId,
          stepKey: created.stepKey,
          nodeType: created.channel,
          status: "pending",
          startedAt: created.scheduledFor,
          completedAt: null,
          durationMs: null,
          logOutput: {
            status: "planned",
            scheduledFor: created.scheduledFor.toISOString(),
          },
        });
        await appendJourneyRunEvent({
          tx: input.tx,
          orgId: input.orgId,
          runId: created.journeyRunId,
          eventType: "delivery_planned",
          message: `Step ${created.stepKey} planned`,
          metadata: {
            stepKey: created.stepKey,
            channel: created.channel,
            scheduledFor: created.scheduledFor.toISOString(),
          },
        });
        scheduledDeliveryIds.push(created.id);
        pendingInngestEvents.push({
          type: "schedule",
          actionType: desired.actionType,
          payload: {
            orgId: input.orgId,
            journeyDeliveryId: created.id,
            journeyRunId: created.journeyRunId,
            deterministicKey: created.deterministicKey,
            scheduledFor: created.scheduledFor.toISOString(),
          },
        });
        return;
      }

      if (created.status === "skipped") {
        await upsertJourneyRunStepLog({
          tx: input.tx,
          orgId: input.orgId,
          runId: created.journeyRunId,
          stepKey: created.stepKey,
          nodeType: created.channel,
          status: "cancelled",
          startedAt: created.scheduledFor,
          completedAt: created.scheduledFor,
          durationMs: 0,
          logOutput: {
            status: "skipped",
            reasonCode: created.reasonCode,
          },
        });
        await appendJourneyRunEvent({
          tx: input.tx,
          orgId: input.orgId,
          runId: created.journeyRunId,
          eventType: "delivery_skipped",
          message: `Step ${created.stepKey} skipped`,
          metadata: {
            stepKey: created.stepKey,
            reasonCode: created.reasonCode,
          },
        });
        skippedDeliveryIds.push(created.id);
      }
    },
    { concurrency: 1 },
  );

  return {
    scheduledDeliveryIds,
    canceledDeliveryIds: staleCanceled.map((delivery) => delivery.id),
    skippedDeliveryIds,
    pendingInngestEvents,
  };
}

async function reconcileRunFromBoundaryTx(input: {
  tx: DbClient;
  orgId: string;
  run: PlannerRunWithJourneyContext;
  graph: LinearJourneyGraph;
  startAfterNodeId: string;
  now: Date;
  freshContext: PlannerFreshContext;
}): Promise<{
  scheduledDeliveryIds: string[];
  canceledDeliveryIds: string[];
  skippedDeliveryIds: string[];
  pendingInngestEvents: PendingInngestEvent[];
}> {
  const buildResult = buildDesiredDeliveries({
    graph: input.graph,
    journeyRunId: input.run.id,
    journeyId: input.run.journeyId ?? input.run.journeyVersionId ?? "unknown",
    appointmentId: input.run.appointmentId,
    triggerEntityId: input.run.triggerEntityId,
    appointmentContext: input.freshContext.appointmentContext,
    clientContext: input.freshContext.clientContext,
    now: input.now,
    orgTimezone: input.freshContext.orgTimezone,
    startAfterNodeId: input.startAfterNodeId,
  });

  const reconciliationResult = await reconcileDeliveries({
    tx: input.tx,
    runId: input.run.id,
    orgId: input.orgId,
    desiredDeliveries: buildResult.desiredDeliveries,
    desiredStepLogs: buildResult.desiredStepLogs,
    desiredRunEvents: buildResult.desiredRunEvents,
  });

  await refreshRunStatusTx(input.tx, input.run.id);
  return reconciliationResult;
}

async function dispatchPendingInngestEvents(input: {
  pendingEvents: PendingInngestEvent[];
  scheduleRequester: (
    actionType: string,
    payload: JourneyDeliveryScheduledEventData,
  ) => Promise<{ eventId?: string }>;
  cancelRequester: (
    payload: JourneyDeliveryCanceledEventData,
  ) => Promise<{ eventId?: string }>;
}): Promise<void> {
  await forEachAsync(
    input.pendingEvents,
    async (pending) => {
      if (pending.type === "schedule") {
        await input.scheduleRequester(pending.actionType, pending.payload);
      } else {
        await input.cancelRequester(pending.payload);
      }
    },
    { concurrency: 1 },
  );
}

export async function processJourneyDomainEvent(
  event: JourneyDomainEventEnvelope,
  dependencies: JourneyPlannerDependencies = {},
): Promise<JourneyPlannerResult> {
  const providerRequesters = dependencies.providerRequesters ?? {};
  const scheduleRequester = (
    actionType: string,
    payload: JourneyDeliveryScheduledEventData,
  ): Promise<{ eventId?: string }> => {
    const override = providerRequesters[actionType];
    if (override) {
      return override(payload);
    }

    return sendJourneyActionExecuteForActionType(actionType, payload);
  };
  const cancelRequester =
    dependencies.cancelRequester ?? sendJourneyDeliveryCanceled;
  const now = dependencies.now ?? new Date();
  const requestedJourneyIds =
    dependencies.journeyIds && dependencies.journeyIds.length > 0
      ? [...new Set(dependencies.journeyIds)]
      : null;

  const { result, pendingEvents } = await withOrg(event.orgId, async (tx) => {
    const journeyFilters = [
      inArray(journeys.state, [...ACTIVE_JOURNEY_STATES]),
    ];
    if (requestedJourneyIds) {
      journeyFilters.push(inArray(journeys.id, requestedJourneyIds));
    }

    const activeJourneys = await tx
      .select({
        id: journeys.id,
        name: journeys.name,
        state: journeys.state,
        mode: journeys.mode,
      })
      .from(journeys)
      .where(
        journeyFilters.length > 1 ? and(...journeyFilters) : journeyFilters[0],
      );

    if (activeJourneys.length === 0) {
      return {
        result: {
          eventId: event.id,
          eventType: event.type,
          orgId: event.orgId,
          plannedRunIds: [],
          scheduledDeliveryIds: [],
          canceledDeliveryIds: [],
          skippedDeliveryIds: [],
          ignoredJourneyIds: [],
          erroredJourneyIds: [],
        },
        pendingEvents: [] as PendingInngestEvent[],
      };
    }

    const versions = await tx
      .select({
        id: journeyVersions.id,
        journeyId: journeyVersions.journeyId,
        version: journeyVersions.version,
        definitionSnapshot: journeyVersions.definitionSnapshot,
        publishedAt: journeyVersions.publishedAt,
      })
      .from(journeyVersions)
      .where(
        inArray(
          journeyVersions.journeyId,
          activeJourneys.map((j) => j.id),
        ),
      )
      .orderBy(desc(journeyVersions.version), desc(journeyVersions.id));

    const [org] = await tx
      .select({
        defaultTimezone: orgs.defaultTimezone,
      })
      .from(orgs)
      .where(eq(orgs.id, event.orgId))
      .limit(1);
    const orgTimezone = org?.defaultTimezone ?? DEFAULT_ORG_TIMEZONE;
    const validClientAttributeKeys =
      event.type === "client.updated"
        ? new Set(
            (
              await customAttributeRepository.listDefinitions(tx, event.orgId)
            ).map((definition) => definition.fieldKey),
          )
        : null;

    const latestVersionByJourneyId = new Map<string, JourneyVersionRow>();
    for (const version of versions) {
      if (!latestVersionByJourneyId.has(version.journeyId)) {
        latestVersionByJourneyId.set(version.journeyId, version);
      }
    }

    const plannedRunIds: string[] = [];
    const scheduledDeliveryIds: string[] = [];
    const canceledDeliveryIds: string[] = [];
    const skippedDeliveryIds: string[] = [];
    const ignoredJourneyIds: string[] = [];
    const erroredJourneyIds: string[] = [];
    const allPendingEvents: PendingInngestEvent[] = [];

    await forEachAsync(
      activeJourneys,
      async (journey) => {
        try {
          const latestVersion = latestVersionByJourneyId.get(journey.id);
          if (!latestVersion) {
            ignoredJourneyIds.push(journey.id);
            return;
          }

          if (event.type === "appointment.confirmed") {
            const payloadRecord = toRecord(event.payload);
            const appointmentId =
              typeof payloadRecord["appointmentId"] === "string"
                ? payloadRecord["appointmentId"]
                : null;
            if (!appointmentId) {
              erroredJourneyIds.push(journey.id);
              return;
            }

            const mode = dependencies.modeOverride ?? journey.mode;
            const pendingConfirmationTimeout =
              await findPlannedConfirmationTimeoutByJourneyTx({
                tx,
                journeyId: journey.id,
                appointmentId,
                mode,
              });

            if (!pendingConfirmationTimeout) {
              ignoredJourneyIds.push(journey.id);
              return;
            }

            const { run, timeoutDelivery } = pendingConfirmationTimeout;
            const parsedRunGraph = parseGraphFromRunSnapshot({
              runId: run.id,
              journeyVersionSnapshot: run.journeyVersionSnapshot,
              logPrefix: "appointment.confirmed",
            });
            if (!parsedRunGraph) {
              erroredJourneyIds.push(journey.id);
              return;
            }

            const [canceledTimeout] = await tx
              .update(journeyDeliveries)
              .set({
                status: "canceled",
                reasonCode: "appointment_confirmed",
                updatedAt: sql`now()`,
              })
              .where(
                and(
                  eq(journeyDeliveries.id, timeoutDelivery.id),
                  eq(journeyDeliveries.status, "planned"),
                ),
              )
              .returning({
                id: journeyDeliveries.id,
                journeyRunId: journeyDeliveries.journeyRunId,
                deterministicKey: journeyDeliveries.deterministicKey,
                stepKey: journeyDeliveries.stepKey,
                scheduledFor: journeyDeliveries.scheduledFor,
              });

            if (!canceledTimeout) {
              ignoredJourneyIds.push(journey.id);
              return;
            }

            canceledDeliveryIds.push(canceledTimeout.id);
            allPendingEvents.push({
              type: "cancel",
              payload: {
                orgId: event.orgId,
                journeyDeliveryId: canceledTimeout.id,
                journeyRunId: canceledTimeout.journeyRunId,
                deterministicKey: canceledTimeout.deterministicKey,
                reasonCode: "appointment_confirmed",
              },
            });

            await upsertJourneyRunStepLog({
              tx,
              orgId: event.orgId,
              runId: canceledTimeout.journeyRunId,
              stepKey: canceledTimeout.stepKey,
              nodeType: "wait-for-confirmation-timeout",
              status: "cancelled",
              startedAt: canceledTimeout.scheduledFor,
              completedAt: now,
              durationMs: 0,
              logOutput: {
                status: "canceled",
                reasonCode: "appointment_confirmed",
              },
            });

            await appendJourneyRunEvent({
              tx,
              orgId: event.orgId,
              runId: canceledTimeout.journeyRunId,
              eventType: "run_resumed_confirmation",
              message: "Run resumed after appointment confirmation",
              metadata: {
                stepKey: canceledTimeout.stepKey,
                eventId: event.id,
              },
            });

            const freshContext = await loadFreshContextForPlannerByRunTx({
              tx,
              orgId: event.orgId,
              triggerEntityType: run.triggerEntityType,
              triggerEntityId: run.triggerEntityId,
              appointmentId: run.appointmentId,
              clientId: run.clientId,
            });

            if (!freshContext) {
              erroredJourneyIds.push(journey.id);
              return;
            }

            const reconciliationResult = await reconcileRunFromBoundaryTx({
              tx,
              orgId: event.orgId,
              run,
              graph: parsedRunGraph,
              startAfterNodeId: timeoutDelivery.stepKey,
              now,
              freshContext,
            });

            plannedRunIds.push(run.id);
            scheduledDeliveryIds.push(
              ...reconciliationResult.scheduledDeliveryIds,
            );
            canceledDeliveryIds.push(
              ...reconciliationResult.canceledDeliveryIds,
            );
            skippedDeliveryIds.push(...reconciliationResult.skippedDeliveryIds);
            allPendingEvents.push(...reconciliationResult.pendingInngestEvents);
            return;
          }

          const parsedGraph = linearJourneyGraphSchema.safeParse(
            latestVersion.definitionSnapshot,
          );

          if (!parsedGraph.success) {
            erroredJourneyIds.push(journey.id);
            return;
          }

          const triggerResolution = resolveJourneyTriggerRuntime({
            graph: parsedGraph.data,
            eventType: event.type,
            payload: event.payload,
          });

          if (triggerResolution.status === "invalid_config") {
            ignoredJourneyIds.push(journey.id);
            return;
          }

          if (triggerResolution.status === "unsupported_trigger_type") {
            ignoredJourneyIds.push(journey.id);
            return;
          }

          if (triggerResolution.status === "missing_run_identity") {
            erroredJourneyIds.push(journey.id);
            return;
          }

          const { triggerConfig, routing } = triggerResolution;
          const invalidTrackedAttributeReason =
            resolveInvalidTrackedAttributeReason({
              triggerConfig,
              validClientAttributeKeys,
            });
          if (invalidTrackedAttributeReason) {
            journeyPlannerLogger.error(
              "Journey trigger config invalid for journey {journeyId}: {reason}",
              {
                journeyId: journey.id,
                reason: invalidTrackedAttributeReason,
              },
            );
            erroredJourneyIds.push(journey.id);
            return;
          }

          if (routing === "ignore") {
            ignoredJourneyIds.push(journey.id);
            return;
          }

          const { runIdentity, appointmentContext, clientContext } =
            triggerResolution;

          const mode = dependencies.modeOverride ?? journey.mode;
          const runResult = await findOrCreateJourneyRun({
            tx,
            orgId: event.orgId,
            journey,
            journeyVersion: latestVersion,
            runIdentity,
            mode,
          });
          const run = runResult.run;

          if (runResult.created) {
            await appendJourneyRunEvent({
              tx,
              orgId: event.orgId,
              runId: run.id,
              eventType: "run_started",
              message: "Manual run started",
              metadata: {
                journeyId: journey.id,
                journeyVersion: latestVersion.version,
                mode,
              },
            });
          }

          if (routing === "cancel") {
            // 1. Cancel pending scheduled-path deliveries (existing behavior)
            const cancelResult = await cancelPendingDeliveries({
              tx,
              runId: run.id,
              reasonCode: "execution_terminal",
              orgId: event.orgId,
            });

            canceledDeliveryIds.push(...cancelResult.canceledIds);
            allPendingEvents.push(...cancelResult.pendingEvents);

            // 2. Build cancel-branch deliveries (if wired)
            const cancelBuildResult = buildDesiredDeliveries({
              graph: parsedGraph.data,
              journeyRunId: run.id,
              journeyId: journey.id,
              appointmentId: runIdentity.appointmentId,
              triggerEntityId: runIdentity.triggerEntityId,
              appointmentContext,
              clientContext,
              eventType: event.type,
              eventTimestamp: event.timestamp,
              now,
              orgTimezone,
              triggerBranch: "canceled",
            });

            // 3. If cancel path has deliveries, reopen run and reconcile
            if (cancelBuildResult.desiredDeliveries.length > 0) {
              await markRunPlanned({
                tx,
                runId: run.id,
              });

              const cancelReconcileResult = await reconcileDeliveries({
                tx,
                runId: run.id,
                orgId: event.orgId,
                desiredDeliveries: cancelBuildResult.desiredDeliveries,
                desiredStepLogs: cancelBuildResult.desiredStepLogs,
                desiredRunEvents: cancelBuildResult.desiredRunEvents,
              });

              scheduledDeliveryIds.push(
                ...cancelReconcileResult.scheduledDeliveryIds,
              );
              allPendingEvents.push(
                ...cancelReconcileResult.pendingInngestEvents,
              );

              await refreshRunStatusTx(tx, run.id);
            }
            return;
          }

          if (triggerConfig.filter) {
            const filterResult = evaluateJourneyTriggerFilter({
              filter: triggerConfig.filter,
              context: {
                appointment: appointmentContext,
                client: clientContext,
              },
              now,
              orgTimezone,
            });

            if (!filterResult.matched) {
              const cancelResult = await cancelPendingDeliveries({
                tx,
                runId: run.id,
                reasonCode: "execution_terminal",
                orgId: event.orgId,
              });

              canceledDeliveryIds.push(...cancelResult.canceledIds);
              allPendingEvents.push(...cancelResult.pendingEvents);
              return;
            }
          }

          await markRunPlanned({
            tx,
            runId: run.id,
          });
          await appendJourneyRunEvent({
            tx,
            orgId: event.orgId,
            runId: run.id,
            eventType: "run_planned",
            message: "Run planned from trigger event",
            metadata: {
              eventId: event.id,
              eventType: event.type,
            },
          });

          plannedRunIds.push(run.id);

          const buildResult = buildDesiredDeliveries({
            graph: parsedGraph.data,
            journeyRunId: run.id,
            journeyId: journey.id,
            appointmentId: runIdentity.appointmentId,
            triggerEntityId: runIdentity.triggerEntityId,
            appointmentContext,
            clientContext,
            eventType: event.type,
            eventTimestamp: event.timestamp,
            now,
            orgTimezone,
            triggerBranch: "scheduled",
          });

          const reconciliationResult = await reconcileDeliveries({
            tx,
            runId: run.id,
            orgId: event.orgId,
            desiredDeliveries: buildResult.desiredDeliveries,
            desiredStepLogs: buildResult.desiredStepLogs,
            desiredRunEvents: buildResult.desiredRunEvents,
          });

          scheduledDeliveryIds.push(
            ...reconciliationResult.scheduledDeliveryIds,
          );
          canceledDeliveryIds.push(...reconciliationResult.canceledDeliveryIds);
          skippedDeliveryIds.push(...reconciliationResult.skippedDeliveryIds);
          allPendingEvents.push(...reconciliationResult.pendingInngestEvents);

          await refreshRunStatusTx(tx, run.id);
        } catch {
          erroredJourneyIds.push(journey.id);
        }
      },
      { concurrency: 1 },
    );

    return {
      result: {
        eventId: event.id,
        eventType: event.type,
        orgId: event.orgId,
        plannedRunIds,
        scheduledDeliveryIds,
        canceledDeliveryIds,
        skippedDeliveryIds,
        ignoredJourneyIds,
        erroredJourneyIds,
      },
      pendingEvents: allPendingEvents,
    };
  });

  // Fire Inngest events after the transaction has committed.
  await dispatchPendingInngestEvents({
    pendingEvents,
    scheduleRequester,
    cancelRequester,
  });

  return result;
}

export type WaitResumeInput = {
  orgId: string;
  journeyRunId: string;
  journeyDeliveryId: string;
  stepKey: string;
};

export type WaitForConfirmationTimeoutInput = {
  orgId: string;
  journeyRunId: string;
  journeyDeliveryId: string;
  stepKey: string;
};

type WaitResumeDependencies = {
  now?: Date;
  loadFreshContextByRun?: typeof loadFreshContextForPlannerByRun;
  scheduleRequester?: (
    actionType: string,
    payload: JourneyDeliveryScheduledEventData,
  ) => Promise<{ eventId?: string }>;
  cancelRequester?: (
    payload: JourneyDeliveryCanceledEventData,
  ) => Promise<{ eventId?: string }>;
};

type WaitForConfirmationTimeoutDependencies = {
  now?: Date;
  loadFreshContextByRun?: typeof loadFreshContextForPlannerByRun;
  scheduleRequester?: (
    actionType: string,
    payload: JourneyDeliveryScheduledEventData,
  ) => Promise<{ eventId?: string }>;
  cancelRequester?: (
    payload: JourneyDeliveryCanceledEventData,
  ) => Promise<{ eventId?: string }>;
};

export type WaitResumeResult = {
  scheduledDeliveryIds: string[];
  canceledDeliveryIds: string[];
};

export type WaitForConfirmationTimeoutResult = {
  scheduledDeliveryIds: string[];
  canceledDeliveryIds: string[];
};

export async function executeWaitForConfirmationTimeout(
  input: WaitForConfirmationTimeoutInput,
  dependencies: WaitForConfirmationTimeoutDependencies = {},
): Promise<WaitForConfirmationTimeoutResult> {
  const now = dependencies.now ?? new Date();
  const loadFreshContextByRun =
    dependencies.loadFreshContextByRun ?? loadFreshContextForPlannerByRun;
  const scheduleRequester =
    dependencies.scheduleRequester ??
    ((actionType: string, payload: JourneyDeliveryScheduledEventData) =>
      sendJourneyActionExecuteForActionType(actionType, payload));
  const cancelRequester =
    dependencies.cancelRequester ?? sendJourneyDeliveryCanceled;

  const run = await withOrg(input.orgId, (tx) =>
    loadPlannerRunByIdTx({
      tx,
      journeyRunId: input.journeyRunId,
    }),
  );

  if (!run) {
    journeyPlannerLogger.warn(
      "wait-for-confirmation-timeout: run {runId} not found, skipping",
      {
        runId: input.journeyRunId,
      },
    );
    return { scheduledDeliveryIds: [], canceledDeliveryIds: [] };
  }

  if (run.status !== "planned" && run.status !== "running") {
    journeyPlannerLogger.info(
      "wait-for-confirmation-timeout: run {runId} is {status}, skipping",
      { runId: input.journeyRunId, status: run.status },
    );
    return { scheduledDeliveryIds: [], canceledDeliveryIds: [] };
  }

  const parsedGraph = parseGraphFromRunSnapshot({
    runId: input.journeyRunId,
    journeyVersionSnapshot: run.journeyVersionSnapshot,
    logPrefix: "wait-for-confirmation-timeout",
  });
  if (!parsedGraph) {
    return { scheduledDeliveryIds: [], canceledDeliveryIds: [] };
  }

  const freshContext = await loadFreshContextByRun({
    orgId: input.orgId,
    triggerEntityType: run.triggerEntityType,
    triggerEntityId: run.triggerEntityId,
    appointmentId: run.appointmentId,
    clientId: run.clientId,
  });

  if (!freshContext) {
    journeyPlannerLogger.warn(
      "wait-for-confirmation-timeout: trigger context not found for run {runId} entity {entityType}:{entityId}",
      {
        runId: input.journeyRunId,
        entityType: run.triggerEntityType,
        entityId: run.triggerEntityId,
      },
    );
    return { scheduledDeliveryIds: [], canceledDeliveryIds: [] };
  }

  const requiresConfirmation = resolveAppointmentRequiresConfirmation(
    freshContext.appointmentContext,
  );
  const appointmentStatus = resolveAppointmentStatus(
    freshContext.appointmentContext,
  );
  const isConfirmed = appointmentStatus === "confirmed";

  if (!requiresConfirmation || isConfirmed) {
    const { pendingInngestEvents, ...reconciliationResult } = await withOrg(
      input.orgId,
      async (tx) => {
        await tx
          .update(journeyDeliveries)
          .set({ status: "sent", updatedAt: sql`now()` })
          .where(
            and(
              eq(journeyDeliveries.id, input.journeyDeliveryId),
              eq(journeyDeliveries.status, "planned"),
            ),
          );

        const result = await reconcileRunFromBoundaryTx({
          tx,
          orgId: input.orgId,
          run,
          graph: parsedGraph,
          startAfterNodeId: input.stepKey,
          now,
          freshContext,
        });
        return result;
      },
    );

    await dispatchPendingInngestEvents({
      pendingEvents: pendingInngestEvents,
      scheduleRequester,
      cancelRequester,
    });

    return {
      scheduledDeliveryIds: reconciliationResult.scheduledDeliveryIds,
      canceledDeliveryIds: reconciliationResult.canceledDeliveryIds,
    };
  }

  const cancelResult = await withOrg(input.orgId, async (tx) => {
    await tx
      .update(journeyDeliveries)
      .set({ status: "sent", updatedAt: sql`now()` })
      .where(
        and(
          eq(journeyDeliveries.id, input.journeyDeliveryId),
          eq(journeyDeliveries.status, "planned"),
        ),
      );

    return cancelPendingDeliveries({
      tx,
      runId: run.id,
      reasonCode: "wait_for_confirmation_timeout",
      orgId: input.orgId,
    });
  });

  await dispatchPendingInngestEvents({
    pendingEvents: cancelResult.pendingEvents,
    scheduleRequester,
    cancelRequester,
  });

  return {
    scheduledDeliveryIds: [],
    canceledDeliveryIds: cancelResult.canceledIds,
  };
}

export async function executeWaitResume(
  input: WaitResumeInput,
  dependencies: WaitResumeDependencies = {},
): Promise<WaitResumeResult> {
  const now = dependencies.now ?? new Date();
  const loadFreshContextByRun =
    dependencies.loadFreshContextByRun ?? loadFreshContextForPlannerByRun;
  const scheduleRequester =
    dependencies.scheduleRequester ??
    ((actionType: string, payload: JourneyDeliveryScheduledEventData) =>
      sendJourneyActionExecuteForActionType(actionType, payload));
  const cancelRequester =
    dependencies.cancelRequester ?? sendJourneyDeliveryCanceled;

  const run = await withOrg(input.orgId, (tx) =>
    loadPlannerRunByIdTx({
      tx,
      journeyRunId: input.journeyRunId,
    }),
  );

  if (!run) {
    journeyPlannerLogger.warn("wait-resume: run {runId} not found, skipping", {
      runId: input.journeyRunId,
    });
    return { scheduledDeliveryIds: [], canceledDeliveryIds: [] };
  }

  if (run.status !== "planned" && run.status !== "running") {
    journeyPlannerLogger.info(
      "wait-resume: run {runId} is {status}, skipping",
      { runId: input.journeyRunId, status: run.status },
    );
    return { scheduledDeliveryIds: [], canceledDeliveryIds: [] };
  }

  const parsedGraph = parseGraphFromRunSnapshot({
    runId: input.journeyRunId,
    journeyVersionSnapshot: run.journeyVersionSnapshot,
    logPrefix: "wait-resume",
  });
  if (!parsedGraph) {
    return { scheduledDeliveryIds: [], canceledDeliveryIds: [] };
  }

  // 3. Fetch fresh trigger context from DB
  const freshContext = await loadFreshContextByRun({
    orgId: input.orgId,
    triggerEntityType: run.triggerEntityType,
    triggerEntityId: run.triggerEntityId,
    appointmentId: run.appointmentId,
    clientId: run.clientId,
  });

  if (!freshContext) {
    journeyPlannerLogger.warn(
      "wait-resume: trigger context not found for run {runId} entity {entityType}:{entityId}",
      {
        runId: input.journeyRunId,
        entityType: run.triggerEntityType,
        entityId: run.triggerEntityId,
      },
    );
    return { scheduledDeliveryIds: [], canceledDeliveryIds: [] };
  }

  const { pendingInngestEvents, ...reconciliationResult } = await withOrg(
    input.orgId,
    async (tx) => {
      // Mark this wait-resume delivery as sent BEFORE reconciliation so it
      // won't be detected as stale and canceled during reconcileDeliveries.
      await tx
        .update(journeyDeliveries)
        .set({ status: "sent", updatedAt: sql`now()` })
        .where(
          and(
            eq(journeyDeliveries.id, input.journeyDeliveryId),
            eq(journeyDeliveries.status, "planned"),
          ),
        );

      const result = await reconcileRunFromBoundaryTx({
        tx,
        orgId: input.orgId,
        run,
        graph: parsedGraph,
        startAfterNodeId: input.stepKey,
        now,
        freshContext,
      });

      return result;
    },
  );

  await dispatchPendingInngestEvents({
    pendingEvents: pendingInngestEvents,
    scheduleRequester,
    cancelRequester,
  });

  return {
    scheduledDeliveryIds: reconciliationResult.scheduledDeliveryIds,
    canceledDeliveryIds: reconciliationResult.canceledDeliveryIds,
  };
}
