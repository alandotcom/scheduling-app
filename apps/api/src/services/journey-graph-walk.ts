import { getLogger } from "@logtape/logtape";
import {
  getConditionBranchFromEdge,
  getTriggerBranchFromEdge,
  type ConditionBranch,
  type LinearJourneyGraph,
  type TriggerBranch,
} from "@scheduling/dto";
import { toRecord } from "../lib/type-guards.js";
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
import { resolveWaitUntil } from "./workflow-wait-time.js";

// Pure graph-walk helpers shared by the legacy planner (`journey-planner.ts`)
// and the Inngest-native run executor (`journey-run-executor.ts`). Everything
// here is a pure function of the (pinned) graph plus the trigger context — no DB
// access, no transactions, no side effects — so the same logic decides how a run
// advances regardless of which engine drives it.

type ActionNode = LinearJourneyGraph["nodes"][number];
export type JourneyEdge = LinearJourneyGraph["edges"][number];

const graphWalkLogger = getLogger(["journeys", "graph-walk"]);

const knownActionTypes = new Set([
  "wait",
  "wait-for-confirmation",
  "condition",
  ...deliveryActionTypes,
]);

export function getActionConfig(node: ActionNode): Record<string, unknown> {
  return toRecord(node.attributes.data.config);
}

export function getNormalizedActionType(node: ActionNode): string | null {
  const config = getActionConfig(node);
  const normalized = normalizeActionType(config["actionType"]);
  return normalized && knownActionTypes.has(normalized) ? normalized : null;
}

export function isJourneyDeliveryActionType(
  actionType: string | null,
): boolean {
  if (!actionType) {
    return false;
  }

  return getProviderForActionType(actionType) !== undefined;
}

export function resolveChannel(actionType: string): string {
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

export function resolveWaitCursor(input: {
  node: ActionNode;
  cursor: Date;
  appointmentContext: Record<string, unknown>;
  clientContext: Record<string, unknown>;
  orgTimezone: string;
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
    orgTimezone?: string;
    waitAllowedHoursMode?: unknown;
    waitAllowedStartTime?: unknown;
    waitAllowedEndTime?: unknown;
  } = {
    now: input.cursor,
    waitDuration: config["waitDuration"],
    waitUntil,
    waitOffset: config["waitOffset"],
    orgTimezone: input.orgTimezone,
    waitAllowedHoursMode: config["waitAllowedHoursMode"],
    waitAllowedStartTime: config["waitAllowedStartTime"],
    waitAllowedEndTime: config["waitAllowedEndTime"],
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

export function toNumber(value: unknown): number | null {
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

export function resolveAppointmentRequiresConfirmation(
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

export function resolveAppointmentStatus(
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

export function resolveWaitForConfirmationTimeoutAt(input: {
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

export function buildNodeById(
  graph: LinearJourneyGraph,
): Map<string, ActionNode> {
  const nodeById = new Map<string, ActionNode>();

  for (const node of graph.nodes) {
    nodeById.set(node.attributes.id, node);
  }

  return nodeById;
}

export function buildOutgoingEdgesBySource(
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

export function getTriggerNode(graph: LinearJourneyGraph): ActionNode | null {
  return (
    graph.nodes.find((node) => node.attributes.data.type === "trigger") ?? null
  );
}

export function resolveDefaultNextNodeIds(input: {
  sourceNodeId: string;
  outgoingEdgesBySource: Map<string, JourneyEdge[]>;
}): string[] {
  const outgoingEdges =
    input.outgoingEdgesBySource.get(input.sourceNodeId) ?? [];
  return outgoingEdges.map((edge) => edge.target);
}

function resolveConditionNextNodeIds(input: {
  sourceNodeId: string;
  branch: ConditionBranch;
  outgoingEdgesBySource: Map<string, JourneyEdge[]>;
}): string[] {
  const outgoingEdges =
    input.outgoingEdgesBySource.get(input.sourceNodeId) ?? [];
  // A condition branch may fan out to multiple targets that all run.
  return outgoingEdges
    .filter((edge) => getConditionBranchFromEdge(edge) === input.branch)
    .map((edge) => edge.target);
}

export function resolveTriggerNextNodeIds(input: {
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
    // Backwards compat: no branch labels -> "scheduled" gets all edges, terminal branches get none.
    if (input.branch === "scheduled") {
      return outgoingEdges.map((edge) => edge.target);
    }
    return [];
  }

  return matchingTargets;
}

export function getConditionExpression(node: ActionNode): unknown {
  const config = getActionConfig(node);
  return config["expression"];
}

export function resolveConditionNextNodeIdForContext(input: {
  node: ActionNode;
  outgoingEdgesBySource: Map<string, JourneyEdge[]>;
  appointmentContext: Record<string, unknown>;
  clientContext: Record<string, unknown>;
  journeyId: string;
  triggerEntityId: string;
  now: Date;
  orgTimezone: string;
}): {
  nextNodeIds: string[];
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
    graphWalkLogger.error(
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
    nextNodeIds: resolveConditionNextNodeIds({
      sourceNodeId: input.node.attributes.id,
      branch,
      outgoingEdgesBySource: input.outgoingEdgesBySource,
    }),
    matched: conditionResult.matched,
    error: conditionResult.error ?? null,
  };
}
