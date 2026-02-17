import { forEachAsync } from "es-toolkit/array";
import { getLogger } from "@logtape/logtape";
import {
  journeyTriggerConfigSchema,
  linearJourneyGraphSchema,
  type DomainEventDataByType,
  type DomainEventType,
  type JourneyTriggerConfig,
  type LinearJourneyGraph,
} from "@scheduling/dto";
import {
  journeyDeliveries,
  journeyRuns,
  orgs,
  journeys,
  journeyVersions,
} from "@scheduling/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { withOrg, type DbClient } from "../lib/db.js";
import {
  sendJourneyActionSendResendExecute,
  sendJourneyActionSendSlackExecute,
  sendJourneyDeliveryCanceled,
  sendJourneyDeliveryScheduled,
  type JourneyDeliveryCanceledEventData,
  type JourneyDeliveryScheduledEventData,
} from "../inngest/runtime-events.js";
import { evaluateJourneyConditionExpression } from "./journey-condition-evaluator.js";
import { evaluateJourneyTriggerFilter } from "./journey-trigger-filters.js";
import { resolveWaitUntil } from "./workflow-wait-time.js";

const ACTIVE_JOURNEY_STATES = ["published", "test_only"] as const;
const ACTIVE_RUN_STATUSES = ["planned", "running"] as const;
const DEFAULT_ORG_TIMEZONE = "UTC";
const journeyPlannerLogger = getLogger(["journeys", "planner"]);

export type JourneyPlannerDomainEventType = Extract<
  DomainEventType,
  "appointment.scheduled" | "appointment.rescheduled" | "appointment.canceled"
>;

export type JourneyDomainEventEnvelope = {
  id: string;
  orgId: string;
  type: JourneyPlannerDomainEventType;
  payload: DomainEventDataByType[JourneyPlannerDomainEventType];
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

type JourneyPlannerDependencies = {
  scheduleResendRequester?: (
    payload: JourneyDeliveryScheduledEventData,
  ) => Promise<{ eventId?: string }>;
  scheduleSlackRequester?: (
    payload: JourneyDeliveryScheduledEventData,
  ) => Promise<{ eventId?: string }>;
  scheduleLoggerRequester?: (
    payload: JourneyDeliveryScheduledEventData,
  ) => Promise<{ eventId?: string }>;
  cancelRequester?: (
    payload: JourneyDeliveryCanceledEventData,
  ) => Promise<{ eventId?: string }>;
  now?: Date;
  journeyIds?: readonly string[];
  modeOverride?: "live" | "test";
};

type JourneyRow = Pick<typeof journeys.$inferSelect, "id" | "name" | "state">;

type JourneyVersionRow = Pick<
  typeof journeyVersions.$inferSelect,
  "id" | "journeyId" | "version" | "definitionSnapshot" | "publishedAt"
>;

type JourneyRunRow = typeof journeyRuns.$inferSelect;

type JourneyDeliveryRow = typeof journeyDeliveries.$inferSelect;

type JourneyDeliveryActionType =
  | "send-resend"
  | "send-resend-template"
  | "send-slack"
  | "logger";

type DesiredDelivery = {
  actionType: JourneyDeliveryActionType;
  deterministicKey: string;
  stepKey: string;
  channel: string;
  scheduledFor: Date;
  status: "planned" | "skipped";
  reasonCode: string | null;
};

type ActionNode = LinearJourneyGraph["nodes"][number];
type JourneyEdge = LinearJourneyGraph["edges"][number];
type ConditionBranch = "true" | "false";
type JourneyNodeActionType =
  | "wait"
  | "condition"
  | "send-resend"
  | "send-resend-template"
  | "send-slack"
  | "logger";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function normalizeActionType(value: unknown): JourneyNodeActionType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  if (
    normalized === "wait" ||
    normalized === "condition" ||
    normalized === "send-resend" ||
    normalized === "send-resend-template" ||
    normalized === "send-slack" ||
    normalized === "logger"
  ) {
    return normalized;
  }

  return null;
}

function getActionConfig(node: ActionNode): Record<string, unknown> {
  return toRecord(node.attributes.data.config);
}

function getNormalizedActionType(
  node: ActionNode,
): JourneyNodeActionType | null {
  const config = getActionConfig(node);
  return normalizeActionType(config["actionType"]);
}

function assertNever(_value: never): never {
  throw new Error("Unsupported action type.");
}

function isJourneyDeliveryActionType(
  actionType: JourneyNodeActionType | null,
): actionType is JourneyDeliveryActionType {
  return (
    actionType === "send-resend" ||
    actionType === "send-resend-template" ||
    actionType === "send-slack" ||
    actionType === "logger"
  );
}

function resolveChannel(actionType: JourneyDeliveryActionType): string {
  switch (actionType) {
    case "send-resend":
    case "send-resend-template":
      return "email";
    case "send-slack":
      return "slack";
    case "logger":
      return "logger";
  }

  return assertNever(actionType);
}

function resolveScheduleRequester(input: {
  actionType: JourneyDeliveryActionType;
  scheduleResendRequester: (
    payload: JourneyDeliveryScheduledEventData,
  ) => Promise<{ eventId?: string }>;
  scheduleSlackRequester: (
    payload: JourneyDeliveryScheduledEventData,
  ) => Promise<{ eventId?: string }>;
  scheduleLoggerRequester: (
    payload: JourneyDeliveryScheduledEventData,
  ) => Promise<{ eventId?: string }>;
}): (
  payload: JourneyDeliveryScheduledEventData,
) => Promise<{ eventId?: string }> {
  switch (input.actionType) {
    case "send-resend":
    case "send-resend-template":
      return input.scheduleResendRequester;
    case "send-slack":
      return input.scheduleSlackRequester;
    case "logger":
      return input.scheduleLoggerRequester;
  }

  return assertNever(input.actionType);
}

function resolveReferenceValue(
  value: unknown,
  appointmentContext: Record<string, unknown>,
): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("@")) {
    return value;
  }

  const reference = trimmed.slice(1);

  const appointmentDataMatch = /^appointment\.data\.(.+)$/i.exec(reference);
  const appointmentMatch = /^appointment\.(.+)$/i.exec(reference);
  const dataMatch = /^data\.(.+)$/i.exec(reference);
  const path =
    appointmentDataMatch?.[1] ??
    appointmentMatch?.[1] ??
    dataMatch?.[1] ??
    null;

  if (!path) {
    return null;
  }

  let current: unknown = appointmentContext;
  for (const segment of path.split(".")) {
    const currentRecord = isRecord(current) ? current : null;
    if (!currentRecord || !(segment in currentRecord)) {
      return null;
    }

    current = currentRecord[segment];
  }

  if (current instanceof Date) {
    return current.toISOString();
  }

  return current;
}

function resolveWaitCursor(input: {
  node: ActionNode;
  cursor: Date;
  appointmentContext: Record<string, unknown>;
}): Date {
  const config = getActionConfig(input.node);
  const waitTimezone =
    typeof config["waitTimezone"] === "string" ? config["waitTimezone"] : null;
  const waitUntil = resolveReferenceValue(
    config["waitUntil"],
    input.appointmentContext,
  );

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

function resolveDefaultNextNodeId(input: {
  sourceNodeId: string;
  outgoingEdgesBySource: Map<string, JourneyEdge[]>;
}): string | null {
  const outgoingEdges =
    input.outgoingEdgesBySource.get(input.sourceNodeId) ?? [];
  return outgoingEdges[0]?.target ?? null;
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

function getConditionExpression(node: ActionNode): unknown {
  const config = getActionConfig(node);
  return config["expression"];
}

function resolveNextNodeId(input: {
  node: ActionNode;
  outgoingEdgesBySource: Map<string, JourneyEdge[]>;
  appointmentContext: Record<string, unknown>;
  clientContext: Record<string, unknown>;
  journeyId: string;
  appointmentId: string;
  now: Date;
  orgTimezone: string;
}): string | null {
  const actionType = getNormalizedActionType(input.node);
  if (actionType !== "condition") {
    return resolveDefaultNextNodeId({
      sourceNodeId: input.node.attributes.id,
      outgoingEdgesBySource: input.outgoingEdgesBySource,
    });
  }

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
      "Journey condition evaluation failed for journey {journeyId} node {nodeId} appointment {appointmentId}: {errorCode} {errorMessage}",
      {
        journeyId: input.journeyId,
        nodeId: input.node.attributes.id,
        appointmentId: input.appointmentId,
        errorCode: conditionResult.error.code,
        errorMessage: conditionResult.error.message,
      },
    );
  }

  const branch: ConditionBranch = conditionResult.matched ? "true" : "false";
  return resolveConditionNextNodeId({
    sourceNodeId: input.node.attributes.id,
    branch,
    outgoingEdgesBySource: input.outgoingEdgesBySource,
  });
}

function buildDeliveryDeterministicKey(input: {
  journeyRunId: string;
  stepKey: string;
  scheduledFor: Date;
}): string {
  return `${input.journeyRunId}:${input.stepKey}:${input.scheduledFor.toISOString()}`;
}

function extractAppointmentId(payload: unknown): string | null {
  const payloadRecord = toRecord(payload);
  return typeof payloadRecord["appointmentId"] === "string"
    ? payloadRecord["appointmentId"]
    : null;
}

function resolveTriggerRouting(input: {
  triggerConfig: JourneyTriggerConfig;
  eventType: JourneyPlannerDomainEventType;
}): "plan" | "cancel" | "ignore" {
  if (input.triggerConfig.stop === input.eventType) {
    return "cancel";
  }

  if (
    input.triggerConfig.start === input.eventType ||
    input.triggerConfig.restart === input.eventType
  ) {
    return "plan";
  }

  return "ignore";
}

function getTriggerConfig(
  graph: LinearJourneyGraph,
): JourneyTriggerConfig | null {
  const triggerNode = getTriggerNode(graph);
  if (!triggerNode) {
    return null;
  }

  const parsed = journeyTriggerConfigSchema.safeParse(
    triggerNode.attributes.data.config,
  );

  return parsed.success ? parsed.data : null;
}

function buildDesiredDeliveries(input: {
  graph: LinearJourneyGraph;
  journeyRunId: string;
  journeyId: string;
  appointmentId: string;
  appointmentContext: Record<string, unknown>;
  clientContext: Record<string, unknown>;
  eventTimestamp: string;
  now: Date;
  orgTimezone: string;
}): DesiredDelivery[] {
  const triggerNode = getTriggerNode(input.graph);
  if (!triggerNode) {
    return [];
  }

  const nodeById = buildNodeById(input.graph);
  const outgoingEdgesBySource = buildOutgoingEdgesBySource(input.graph);
  let cursor = new Date(input.eventTimestamp);

  if (Number.isNaN(cursor.getTime())) {
    cursor = input.now;
  }

  const desiredDeliveries: DesiredDelivery[] = [];
  const visitedNodeIds = new Set<string>();
  let currentNodeId = resolveDefaultNextNodeId({
    sourceNodeId: triggerNode.attributes.id,
    outgoingEdgesBySource,
  });

  while (currentNodeId) {
    if (visitedNodeIds.has(currentNodeId)) {
      break;
    }
    visitedNodeIds.add(currentNodeId);

    const node = nodeById.get(currentNodeId);
    if (!node) {
      break;
    }

    const actionType = getNormalizedActionType(node);

    if (actionType === "wait") {
      cursor = resolveWaitCursor({
        node,
        cursor,
        appointmentContext: input.appointmentContext,
      });
      currentNodeId = resolveDefaultNextNodeId({
        sourceNodeId: node.attributes.id,
        outgoingEdgesBySource,
      });
      continue;
    }

    if (actionType === "condition") {
      currentNodeId = resolveNextNodeId({
        node,
        outgoingEdgesBySource,
        appointmentContext: input.appointmentContext,
        clientContext: input.clientContext,
        journeyId: input.journeyId,
        appointmentId: input.appointmentId,
        now: input.now,
        orgTimezone: input.orgTimezone,
      });
      continue;
    }

    if (!isJourneyDeliveryActionType(actionType)) {
      currentNodeId = resolveDefaultNextNodeId({
        sourceNodeId: node.attributes.id,
        outgoingEdgesBySource,
      });
      continue;
    }

    const scheduledFor = new Date(cursor);
    const isPastDue = scheduledFor.getTime() < input.now.getTime();
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
      status: isPastDue ? "skipped" : "planned",
      reasonCode: isPastDue ? "past_due" : null,
    });

    currentNodeId = resolveDefaultNextNodeId({
      sourceNodeId: node.attributes.id,
      outgoingEdgesBySource,
    });
  }

  return desiredDeliveries;
}

async function findJourneyRun(input: {
  tx: DbClient;
  journeyVersionId: string;
  appointmentId: string;
  mode: "live" | "test";
}): Promise<JourneyRunRow | null> {
  const [run] = await input.tx
    .select()
    .from(journeyRuns)
    .where(
      and(
        eq(journeyRuns.journeyVersionId, input.journeyVersionId),
        eq(journeyRuns.appointmentId, input.appointmentId),
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
  appointmentId: string;
  mode: "live" | "test";
}): Promise<JourneyRunRow> {
  const existing = await findJourneyRun({
    tx: input.tx,
    journeyVersionId: input.journeyVersion.id,
    appointmentId: input.appointmentId,
    mode: input.mode,
  });

  if (existing) {
    return existing;
  }

  const [created] = await input.tx
    .insert(journeyRuns)
    .values({
      orgId: input.orgId,
      journeyVersionId: input.journeyVersion.id,
      appointmentId: input.appointmentId,
      mode: input.mode,
      status: "planned",
      journeyNameSnapshot: input.journey.name,
      journeyVersionSnapshot: {
        version: input.journeyVersion.version,
        definitionSnapshot: input.journeyVersion.definitionSnapshot,
        publishedAt: input.journeyVersion.publishedAt.toISOString(),
      },
    })
    .onConflictDoNothing({
      target: [
        journeyRuns.orgId,
        journeyRuns.journeyVersionId,
        journeyRuns.appointmentId,
        journeyRuns.mode,
      ],
    })
    .returning();

  if (created) {
    return created;
  }

  const resolved = await findJourneyRun({
    tx: input.tx,
    journeyVersionId: input.journeyVersion.id,
    appointmentId: input.appointmentId,
    mode: input.mode,
  });

  if (!resolved) {
    throw new Error("Failed to resolve journey run after upsert.");
  }

  return resolved;
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

async function cancelPendingDeliveries(input: {
  tx: DbClient;
  runId: string;
  reasonCode: string;
  cancelRequester: (
    payload: JourneyDeliveryCanceledEventData,
  ) => Promise<{ eventId?: string }>;
  orgId: string;
}): Promise<string[]> {
  const [plannedRows, runRows] = await Promise.all([
    input.tx
      .select({ id: journeyDeliveries.id })
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
    return [];
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
    });

  await markRunCanceled({
    tx: input.tx,
    runId: input.runId,
  });

  const runId = runRows[0]?.id ?? input.runId;

  await forEachAsync(
    canceled,
    async (delivery) => {
      await input.cancelRequester({
        orgId: input.orgId,
        journeyDeliveryId: delivery.id,
        journeyRunId: runId,
        deterministicKey: delivery.deterministicKey,
        reasonCode: input.reasonCode,
      });
    },
    { concurrency: 1 },
  );

  return canceled.map((delivery) => delivery.id);
}

async function reconcileDeliveries(input: {
  tx: DbClient;
  runId: string;
  orgId: string;
  desiredDeliveries: DesiredDelivery[];
  scheduleResendRequester: (
    payload: JourneyDeliveryScheduledEventData,
  ) => Promise<{ eventId?: string }>;
  scheduleSlackRequester: (
    payload: JourneyDeliveryScheduledEventData,
  ) => Promise<{ eventId?: string }>;
  scheduleLoggerRequester: (
    payload: JourneyDeliveryScheduledEventData,
  ) => Promise<{ eventId?: string }>;
  cancelRequester: (
    payload: JourneyDeliveryCanceledEventData,
  ) => Promise<{ eventId?: string }>;
}): Promise<{
  scheduledDeliveryIds: string[];
  canceledDeliveryIds: string[];
  skippedDeliveryIds: string[];
}> {
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
          });

  await forEachAsync(
    staleCanceled,
    async (delivery) => {
      await input.cancelRequester({
        orgId: input.orgId,
        journeyDeliveryId: delivery.id,
        journeyRunId: delivery.journeyRunId,
        deterministicKey: delivery.deterministicKey,
        reasonCode: "execution_terminal",
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
          scheduledFor: desired.scheduledFor,
          status: desired.status,
          reasonCode: desired.reasonCode,
          deterministicKey: desired.deterministicKey,
        })
        .returning({
          id: journeyDeliveries.id,
          journeyRunId: journeyDeliveries.journeyRunId,
          deterministicKey: journeyDeliveries.deterministicKey,
          scheduledFor: journeyDeliveries.scheduledFor,
          status: journeyDeliveries.status,
        });

      if (!created) {
        return;
      }

      if (created.status === "planned") {
        scheduledDeliveryIds.push(created.id);
        const payload = {
          orgId: input.orgId,
          journeyDeliveryId: created.id,
          journeyRunId: created.journeyRunId,
          deterministicKey: created.deterministicKey,
          scheduledFor: created.scheduledFor.toISOString(),
        };
        const scheduleRequester = resolveScheduleRequester({
          actionType: desired.actionType,
          scheduleResendRequester: input.scheduleResendRequester,
          scheduleSlackRequester: input.scheduleSlackRequester,
          scheduleLoggerRequester: input.scheduleLoggerRequester,
        });
        await scheduleRequester(payload);
        return;
      }

      if (created.status === "skipped") {
        skippedDeliveryIds.push(created.id);
      }
    },
    { concurrency: 1 },
  );

  return {
    scheduledDeliveryIds,
    canceledDeliveryIds: staleCanceled.map((delivery) => delivery.id),
    skippedDeliveryIds,
  };
}

function getClientFilterContext(payload: unknown): Record<string, unknown> {
  const payloadRecord = toRecord(payload);
  return toRecord(payloadRecord["client"]);
}

export async function processJourneyDomainEvent(
  event: JourneyDomainEventEnvelope,
  dependencies: JourneyPlannerDependencies = {},
): Promise<JourneyPlannerResult> {
  const scheduleResendRequester =
    dependencies.scheduleResendRequester ?? sendJourneyActionSendResendExecute;
  const scheduleSlackRequester =
    dependencies.scheduleSlackRequester ?? sendJourneyActionSendSlackExecute;
  const scheduleLoggerRequester =
    dependencies.scheduleLoggerRequester ?? sendJourneyDeliveryScheduled;
  const cancelRequester =
    dependencies.cancelRequester ?? sendJourneyDeliveryCanceled;
  const now = dependencies.now ?? new Date();
  const requestedJourneyIds =
    dependencies.journeyIds && dependencies.journeyIds.length > 0
      ? [...new Set(dependencies.journeyIds)]
      : null;

  return withOrg(event.orgId, async (tx) => {
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
      })
      .from(journeys)
      .where(
        journeyFilters.length > 1 ? and(...journeyFilters) : journeyFilters[0],
      );

    if (activeJourneys.length === 0) {
      return {
        eventId: event.id,
        eventType: event.type,
        orgId: event.orgId,
        plannedRunIds: [],
        scheduledDeliveryIds: [],
        canceledDeliveryIds: [],
        skippedDeliveryIds: [],
        ignoredJourneyIds: [],
        erroredJourneyIds: [],
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

    const appointmentContext = toRecord(event.payload);
    const clientContext = getClientFilterContext(event.payload);
    const appointmentId = extractAppointmentId(event.payload);

    await forEachAsync(
      activeJourneys,
      async (journey) => {
        try {
          const latestVersion = latestVersionByJourneyId.get(journey.id);
          if (!latestVersion) {
            ignoredJourneyIds.push(journey.id);
            return;
          }

          if (!appointmentId) {
            erroredJourneyIds.push(journey.id);
            return;
          }

          const parsedGraph = linearJourneyGraphSchema.safeParse(
            latestVersion.definitionSnapshot,
          );

          if (!parsedGraph.success) {
            erroredJourneyIds.push(journey.id);
            return;
          }

          const triggerConfig = getTriggerConfig(parsedGraph.data);
          if (!triggerConfig) {
            ignoredJourneyIds.push(journey.id);
            return;
          }

          const routing = resolveTriggerRouting({
            triggerConfig,
            eventType: event.type,
          });

          if (routing === "ignore") {
            ignoredJourneyIds.push(journey.id);
            return;
          }

          const mode =
            dependencies.modeOverride ??
            (journey.state === "test_only" ? "test" : "live");
          const run = await findOrCreateJourneyRun({
            tx,
            orgId: event.orgId,
            journey,
            journeyVersion: latestVersion,
            appointmentId,
            mode,
          });

          if (routing === "cancel") {
            const canceledIds = await cancelPendingDeliveries({
              tx,
              runId: run.id,
              reasonCode: "execution_terminal",
              cancelRequester,
              orgId: event.orgId,
            });

            canceledDeliveryIds.push(...canceledIds);
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
              const canceledIds = await cancelPendingDeliveries({
                tx,
                runId: run.id,
                reasonCode: "execution_terminal",
                cancelRequester,
                orgId: event.orgId,
              });

              canceledDeliveryIds.push(...canceledIds);
              return;
            }
          }

          await markRunPlanned({
            tx,
            runId: run.id,
          });

          plannedRunIds.push(run.id);

          const desiredDeliveries = buildDesiredDeliveries({
            graph: parsedGraph.data,
            journeyRunId: run.id,
            journeyId: journey.id,
            appointmentId,
            appointmentContext,
            clientContext,
            eventTimestamp: event.timestamp,
            now,
            orgTimezone,
          });

          const reconciliationResult = await reconcileDeliveries({
            tx,
            runId: run.id,
            orgId: event.orgId,
            desiredDeliveries,
            scheduleResendRequester,
            scheduleSlackRequester,
            scheduleLoggerRequester,
            cancelRequester,
          });

          scheduledDeliveryIds.push(
            ...reconciliationResult.scheduledDeliveryIds,
          );
          canceledDeliveryIds.push(...reconciliationResult.canceledDeliveryIds);
          skippedDeliveryIds.push(...reconciliationResult.skippedDeliveryIds);
        } catch {
          erroredJourneyIds.push(journey.id);
        }
      },
      { concurrency: 1 },
    );

    return {
      eventId: event.id,
      eventType: event.type,
      orgId: event.orgId,
      plannedRunIds,
      scheduledDeliveryIds,
      canceledDeliveryIds,
      skippedDeliveryIds,
      ignoredJourneyIds,
      erroredJourneyIds,
    };
  });
}
