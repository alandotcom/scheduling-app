import {
  cancelJourneyRunResponseSchema,
  cancelJourneyRunsResponseSchema,
  createJourneySchema,
  domainEventDataSchemaByType,
  journeyTriggerConfigSchema,
  linearJourneyGraphSchema,
  listJourneyRunsQuerySchema,
  publishJourneySchema,
  setJourneyModeSchema,
  startJourneyTestRunSchema,
  updateJourneySchema,
  type CreateJourneyInput,
  type CancelJourneyRunResponse,
  type CancelJourneyRunsResponse,
  type Journey,
  type JourneyRun,
  type JourneyRunDelivery,
  type JourneyRunDetailResponse,
  type JourneyRunEvent,
  type JourneyRunStepLog,
  type JourneyRunTriggerContext,
  type LinearJourneyGraph,
  type ListJourneyRunsQuery,
  type PublishJourneyInput,
  type PublishJourneyResponse,
  type SetJourneyModeInput,
  type StartJourneyTestRunInput,
  type StartJourneyTestRunResponse,
  type JourneyTriggerConfig,
  type UpdateJourneyInput,
  type CustomAttributeValues,
} from "@scheduling/dto";
import {
  appointments,
  calendars,
  clients,
  journeyDeliveries,
  journeyRunEvents,
  journeyRunStepLogs,
  journeyRuns,
  journeys,
  journeyVersions,
} from "@scheduling/db/schema";
import { compact, uniq } from "es-toolkit/array";
import { and, asc, desc, eq, ilike, inArray, ne, sql } from "drizzle-orm";
import { ApplicationError } from "../errors/application-error.js";
import { withOrg, type DbClient } from "../lib/db.js";
import {
  isUniqueConstraintViolation,
  getConstraintName,
} from "../lib/db-errors.js";
import { isRecord } from "../lib/type-guards.js";
import { customAttributeRepository } from "../repositories/custom-attributes.js";
import type { ServiceContext } from "./locations.js";
import { clientCustomAttributeService } from "./client-custom-attributes.js";
import { processJourneyDomainEvent } from "./journey-planner.js";

const JOURNEY_NAME_UNIQUE_CONSTRAINT = "journeys_org_name_ci_uidx";
const ACTIVE_RUN_STATUSES = ["planned", "running"] as const;
const ACTIVE_RUN_STATUS_SET = new Set<string>(ACTIVE_RUN_STATUSES);
const OVERLAP_CANDIDATE_STATES = ["published", "paused"] as const;
const JOURNEY_DEFINITION_INVALID_CODE = "JOURNEY_DEFINITION_INVALID";
const HIGH_SIGNAL_FILTER_FIELDS = new Set([
  "appointment.calendarId",
  "appointment.appointmentTypeId",
  "appointment.clientId",
]);
const BUILT_IN_CLIENT_TRACKED_ATTRIBUTE_KEYS = [
  "client.id",
  "client.firstName",
  "client.lastName",
  "client.email",
  "client.phone",
] as const;

function journeyNameConflictError(): ApplicationError {
  return new ApplicationError("Journey name already exists", {
    code: "CONFLICT",
    details: { field: "name" },
  });
}

function mapJourneyWriteError(error: unknown): ApplicationError | null {
  if (!isUniqueConstraintViolation(error)) {
    return null;
  }

  if (getConstraintName(error) === JOURNEY_NAME_UNIQUE_CONSTRAINT) {
    return journeyNameConflictError();
  }

  return new ApplicationError("Journey already exists", {
    code: "CONFLICT",
  });
}

function journeyDefinitionInvalidError(
  issues: unknown,
  message = "Journey definition is invalid",
): ApplicationError {
  return new ApplicationError(message, {
    code: "CONFLICT",
    details: {
      code: JOURNEY_DEFINITION_INVALID_CODE,
      issues,
    },
  });
}

function parseLinearJourneyGraph(definition: unknown): LinearJourneyGraph {
  const parsed = linearJourneyGraphSchema.safeParse(definition);
  if (!parsed.success) {
    throw journeyDefinitionInvalidError(parsed.error.issues);
  }

  return parsed.data;
}

function toJourney(
  row: typeof journeys.$inferSelect,
  currentVersion: number | null,
): Journey {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    status: row.state,
    mode: row.mode,
    currentVersion,
    graph: parseLinearJourneyGraph(row.draftDefinition),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getJourneyCurrentVersionMap(
  tx: DbClient,
  journeyIds: string[],
): Promise<Map<string, number>> {
  if (journeyIds.length === 0) {
    return new Map();
  }

  const rows = await tx
    .select({
      journeyId: journeyVersions.journeyId,
      version: sql<number>`max(${journeyVersions.version})`,
    })
    .from(journeyVersions)
    .where(inArray(journeyVersions.journeyId, journeyIds))
    .groupBy(journeyVersions.journeyId);

  return new Map(
    rows
      .filter((row) => typeof row.version === "number" && row.version > 0)
      .map((row) => [row.journeyId, row.version]),
  );
}

async function getJourneyCurrentVersion(
  tx: DbClient,
  journeyId: string,
): Promise<number | null> {
  const versionMap = await getJourneyCurrentVersionMap(tx, [journeyId]);
  return versionMap.get(journeyId) ?? null;
}

function getJourneyVersionFromSnapshot(
  snapshot: Record<string, unknown>,
): number | null {
  const value = snapshot["version"];
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function toJourneyRun(row: typeof journeyRuns.$inferSelect): JourneyRun {
  return {
    id: row.id,
    journeyVersionId: row.journeyVersionId,
    appointmentId: row.appointmentId,
    mode: row.mode,
    status: row.status,
    journeyNameSnapshot: row.journeyNameSnapshot,
    journeyVersion: getJourneyVersionFromSnapshot(row.journeyVersionSnapshot),
    journeyDeleted: row.journeyVersionId === null,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
  };
}

function toJourneyRunDelivery(
  row: typeof journeyDeliveries.$inferSelect,
): JourneyRunDelivery {
  return {
    id: row.id,
    journeyRunId: row.journeyRunId,
    stepKey: row.stepKey,
    channel: row.channel,
    scheduledFor: row.scheduledFor,
    status: row.status,
    reasonCode: row.reasonCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toJourneyRunEvent(
  row: typeof journeyRunEvents.$inferSelect,
): JourneyRunEvent {
  return {
    id: row.id,
    journeyRunId: row.journeyRunId,
    eventType: row.eventType,
    message: row.message,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
  };
}

function toJourneyRunStepLog(
  row: typeof journeyRunStepLogs.$inferSelect,
): JourneyRunStepLog {
  return {
    id: row.id,
    journeyRunId: row.journeyRunId,
    stepKey: row.stepKey,
    nodeType: row.nodeType,
    status: row.status,
    input: row.input ?? null,
    output: row.output ?? null,
    error: row.error ?? null,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function resolveTriggerEventType(input: {
  events: Array<typeof journeyRunEvents.$inferSelect>;
  stepLogs: Array<typeof journeyRunStepLogs.$inferSelect>;
}): string | null {
  const runPlannedEvent = input.events.find(
    (event) => event.eventType === "run_planned",
  );

  if (runPlannedEvent && isRecord(runPlannedEvent.metadata)) {
    const eventType = runPlannedEvent.metadata["eventType"];
    if (typeof eventType === "string" && eventType.trim().length > 0) {
      return eventType.trim();
    }
  }

  const triggerStepLog = input.stepLogs.find(
    (stepLog) => stepLog.nodeType === "trigger",
  );
  if (!triggerStepLog || !isRecord(triggerStepLog.input)) {
    return null;
  }

  const eventType = triggerStepLog.input["eventType"];
  if (typeof eventType !== "string" || eventType.trim().length === 0) {
    return null;
  }

  return eventType.trim();
}

function resolveTriggerPayload(input: {
  events: Array<typeof journeyRunEvents.$inferSelect>;
  stepLogs: Array<typeof journeyRunStepLogs.$inferSelect>;
}): Record<string, unknown> | null {
  const triggerStepLog = input.stepLogs.find(
    (stepLog) => stepLog.nodeType === "trigger",
  );
  if (triggerStepLog && isRecord(triggerStepLog.input)) {
    return triggerStepLog.input;
  }

  const runPlannedEvent = input.events.find(
    (event) => event.eventType === "run_planned",
  );
  if (runPlannedEvent && isRecord(runPlannedEvent.metadata)) {
    return runPlannedEvent.metadata;
  }

  return null;
}

function toJourneyRunTriggerContext(input: {
  eventType: string | null;
  payload: Record<string, unknown> | null;
  appointment: {
    id: string;
    calendarId: string;
    appointmentTypeId: string;
    clientId: string | null;
    startAt: Date;
    endAt: Date;
    timezone: string;
    status: string;
    notes: string | null;
  } | null;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  } | null;
}): JourneyRunTriggerContext | null {
  if (
    !input.eventType &&
    !input.payload &&
    !input.appointment &&
    !input.client
  ) {
    return null;
  }

  return {
    eventType: input.eventType,
    payload: input.payload,
    appointment: input.appointment,
    client: input.client,
  };
}

function getTriggerConfigFromGraph(
  graph: LinearJourneyGraph,
): JourneyTriggerConfig | null {
  const triggerNode =
    graph.nodes.find((node) => node.attributes.data.type === "trigger") ?? null;
  if (!triggerNode) {
    return null;
  }

  const parsed = journeyTriggerConfigSchema.safeParse(
    triggerNode.attributes.data.config,
  );

  return parsed.success ? parsed.data : null;
}

function collectRoutingEvents(config: JourneyTriggerConfig): string[] {
  if (config.triggerType === "AppointmentJourney") {
    return uniq([config.start, config.restart]);
  }

  if (config.triggerType === "ClientJourney") {
    return [config.event];
  }

  return [];
}

async function validateClientTriggerCustomAttributeReferences(input: {
  tx: DbClient;
  orgId: string;
  graph: LinearJourneyGraph;
}): Promise<void> {
  const triggerConfig = getTriggerConfigFromGraph(input.graph);
  if (
    !triggerConfig ||
    triggerConfig.triggerType !== "ClientJourney" ||
    triggerConfig.event !== "client.updated"
  ) {
    return;
  }

  const trackedAttributeKey = triggerConfig.trackedAttributeKey?.trim();
  if (!trackedAttributeKey) {
    throw journeyDefinitionInvalidError([
      {
        code: "custom",
        path: ["trigger", "config", "trackedAttributeKey"],
        message: 'Client updated triggers must include "trackedAttributeKey".',
      },
    ]);
  }

  const definitions = await customAttributeRepository.listDefinitions(
    input.tx,
    input.orgId,
  );
  const validFieldKeys = new Set<string>([
    ...BUILT_IN_CLIENT_TRACKED_ATTRIBUTE_KEYS,
    ...definitions.map((definition) => definition.fieldKey),
  ]);

  if (validFieldKeys.has(trackedAttributeKey)) {
    return;
  }

  throw journeyDefinitionInvalidError([
    {
      code: "custom",
      path: ["trigger", "config", "trackedAttributeKey"],
      message: `Tracked attribute key "${trackedAttributeKey}" does not exist in supported client attributes.`,
    },
  ]);
}

function collectHighSignalEqualsFilters(
  config: JourneyTriggerConfig,
): Map<string, string> {
  const pairs = new Map<string, string>();

  for (const group of config.filter?.groups ?? []) {
    for (const condition of group.conditions) {
      if (condition.operator !== "equals") {
        continue;
      }

      if (!HIGH_SIGNAL_FILTER_FIELDS.has(condition.field)) {
        continue;
      }

      if (typeof condition.value !== "string") {
        continue;
      }

      pairs.set(condition.field, condition.value);
    }
  }

  return pairs;
}

function validateClientJourneyActionCompatibility(graph: LinearJourneyGraph) {
  const triggerConfig = getTriggerConfigFromGraph(graph);
  if (!triggerConfig || triggerConfig.triggerType !== "ClientJourney") {
    return;
  }

  const violatingNodeIndexes = graph.nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.attributes.data.type === "action")
    .filter(({ node }) => {
      const config = isRecord(node.attributes.data.config)
        ? node.attributes.data.config
        : null;
      if (!config) {
        return false;
      }

      const actionType =
        "actionType" in config ? config["actionType"] : undefined;
      if (typeof actionType !== "string") {
        return false;
      }

      return actionType.trim().toLowerCase() === "wait-for-confirmation";
    })
    .map(({ index }) => index);

  if (violatingNodeIndexes.length === 0) {
    return;
  }

  throw journeyDefinitionInvalidError(
    violatingNodeIndexes.map((nodeIndex) => ({
      code: "custom",
      path: ["nodes", nodeIndex, "attributes", "data", "config", "actionType"],
      message:
        'Client journeys cannot include "Wait For Confirmation" steps. Use appointment journeys for confirmation-aware automation.',
    })),
  );
}

function buildOverlapWarning(input: {
  candidateName: string;
  sharedEvents: string[];
  matchingField?: string;
}): string {
  const eventLabel = input.sharedEvents.join(", ");
  if (!input.matchingField) {
    return `Potential overlap with "${input.candidateName}" on ${eventLabel}.`;
  }

  return `Potential overlap with "${input.candidateName}" on ${eventLabel} (matching ${input.matchingField}).`;
}

async function computePublishOverlapWarnings(input: {
  tx: DbClient;
  journeyId: string;
  graph: LinearJourneyGraph;
}): Promise<string[]> {
  const sourceTriggerConfig = getTriggerConfigFromGraph(input.graph);
  if (!sourceTriggerConfig) {
    return [];
  }

  const sourceEvents = new Set(collectRoutingEvents(sourceTriggerConfig));
  if (sourceEvents.size === 0) {
    return [];
  }

  const sourceHighSignalFilters =
    collectHighSignalEqualsFilters(sourceTriggerConfig);

  const candidateJourneys = await input.tx
    .select({
      id: journeys.id,
      name: journeys.name,
    })
    .from(journeys)
    .where(
      and(
        ne(journeys.id, input.journeyId),
        inArray(journeys.state, [...OVERLAP_CANDIDATE_STATES]),
      ),
    );

  const warnings = await Promise.all(
    candidateJourneys.map(async (candidate) => {
      const [latestVersion] = await input.tx
        .select({
          definitionSnapshot: journeyVersions.definitionSnapshot,
        })
        .from(journeyVersions)
        .where(eq(journeyVersions.journeyId, candidate.id))
        .orderBy(desc(journeyVersions.version), desc(journeyVersions.id))
        .limit(1);

      if (!latestVersion) {
        return null;
      }

      const parsedGraph = linearJourneyGraphSchema.safeParse(
        latestVersion.definitionSnapshot,
      );
      if (!parsedGraph.success) {
        return null;
      }

      const candidateTriggerConfig = getTriggerConfigFromGraph(
        parsedGraph.data,
      );
      if (!candidateTriggerConfig) {
        return null;
      }

      const sharedEvents = collectRoutingEvents(candidateTriggerConfig).filter(
        (eventType) => sourceEvents.has(eventType),
      );
      if (sharedEvents.length === 0) {
        return null;
      }

      if (!sourceTriggerConfig.filter || !candidateTriggerConfig.filter) {
        return buildOverlapWarning({
          candidateName: candidate.name,
          sharedEvents,
        });
      }

      const candidateHighSignalFilters = collectHighSignalEqualsFilters(
        candidateTriggerConfig,
      );

      const matchingField = [...sourceHighSignalFilters.entries()].find(
        ([field, value]) => candidateHighSignalFilters.get(field) === value,
      )?.[0];

      if (!matchingField) {
        return null;
      }

      return buildOverlapWarning({
        candidateName: candidate.name,
        sharedEvents,
        matchingField,
      });
    }),
  );

  return uniq(compact(warnings));
}

async function findJourneyById(
  tx: DbClient,
  id: string,
): Promise<typeof journeys.$inferSelect | null> {
  const [row] = await tx
    .select()
    .from(journeys)
    .where(eq(journeys.id, id))
    .limit(1);

  return row ?? null;
}

async function findJourneyByNameInsensitive(input: {
  tx: DbClient;
  orgId: string;
  name: string;
  excludeId?: string;
}): Promise<typeof journeys.$inferSelect | null> {
  const filters = [sql`lower(${journeys.name}) = lower(${input.name})`];

  if (input.excludeId) {
    filters.push(ne(journeys.id, input.excludeId));
  }

  const [row] = await input.tx
    .select()
    .from(journeys)
    .where(filters.length > 1 ? and(...filters) : filters[0])
    .limit(1);

  return row ?? null;
}

async function generateUntitledName(tx: DbClient): Promise<string> {
  const baseName = "Untitled journey";

  const rows = await tx
    .select({ name: journeys.name })
    .from(journeys)
    .where(ilike(journeys.name, `${baseName}%`));

  const lowerNames = new Set(rows.map((row) => row.name.toLowerCase()));
  if (!lowerNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  for (let index = 2; index <= 100; index += 1) {
    const candidate = `${baseName} (${index})`;
    if (!lowerNames.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `${baseName} (${crypto.randomUUID().slice(0, 8)})`;
}

function validateCreateInput(input: CreateJourneyInput): CreateJourneyInput {
  const parsed = createJourneySchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid journey payload", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

function validateUpdateInput(input: UpdateJourneyInput): UpdateJourneyInput {
  const parsed = updateJourneySchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid journey payload", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

function validatePublishInput(input: PublishJourneyInput): PublishJourneyInput {
  const parsed = publishJourneySchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid publish payload", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

function validateSetModeInput(input: SetJourneyModeInput): SetJourneyModeInput {
  const parsed = setJourneyModeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid journey mode payload", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

function validateListRunsQuery(
  input: ListJourneyRunsQuery,
): ListJourneyRunsQuery {
  const parsed = listJourneyRunsQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid runs query", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

function validateStartTestRunInput(
  input: StartJourneyTestRunInput,
): StartJourneyTestRunInput {
  const parsed = startJourneyTestRunSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid test run payload", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

function mapAppointmentToScheduledPayload(appointment: {
  appointment: Pick<
    typeof appointments.$inferSelect,
    | "id"
    | "calendarId"
    | "appointmentTypeId"
    | "clientId"
    | "startAt"
    | "endAt"
    | "timezone"
    | "status"
    | "notes"
  > & {
    calendarRequiresConfirmation: boolean;
  };
  client: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    customAttributes: CustomAttributeValues;
  };
}) {
  const appointmentSnapshot = appointment.appointment;
  const clientSnapshot = {
    id: appointment.client.id,
    firstName: appointment.client.firstName,
    lastName: appointment.client.lastName,
    email: appointment.client.email,
    phone: appointment.client.phone,
    customAttributes: appointment.client.customAttributes,
  };

  const parsed = domainEventDataSchemaByType["appointment.scheduled"].safeParse(
    {
      appointmentId: appointmentSnapshot.id,
      calendarId: appointmentSnapshot.calendarId,
      calendarRequiresConfirmation:
        appointmentSnapshot.calendarRequiresConfirmation,
      appointmentTypeId: appointmentSnapshot.appointmentTypeId,
      clientId: appointmentSnapshot.clientId,
      startAt: appointmentSnapshot.startAt.toISOString(),
      endAt: appointmentSnapshot.endAt.toISOString(),
      timezone: appointmentSnapshot.timezone,
      status: appointmentSnapshot.status,
      notes: appointmentSnapshot.notes,
      appointment: {
        id: appointmentSnapshot.id,
        calendarId: appointmentSnapshot.calendarId,
        calendarRequiresConfirmation:
          appointmentSnapshot.calendarRequiresConfirmation,
        appointmentTypeId: appointmentSnapshot.appointmentTypeId,
        clientId: appointmentSnapshot.clientId,
        startAt: appointmentSnapshot.startAt.toISOString(),
        endAt: appointmentSnapshot.endAt.toISOString(),
        timezone: appointmentSnapshot.timezone,
        status: appointmentSnapshot.status,
        notes: appointmentSnapshot.notes,
      },
      client: clientSnapshot,
    },
  );

  if (!parsed.success) {
    throw new ApplicationError("Appointment payload is invalid for test run", {
      code: "CONFLICT",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

async function findRunById(
  tx: DbClient,
  runId: string,
): Promise<typeof journeyRuns.$inferSelect | null> {
  const [run] = await tx
    .select()
    .from(journeyRuns)
    .where(eq(journeyRuns.id, runId))
    .limit(1);

  return run ?? null;
}

async function cancelRunsByIds(
  tx: DbClient,
  runIds: string[],
  reasonCode: string,
): Promise<number> {
  if (runIds.length === 0) {
    return 0;
  }

  await tx
    .update(journeyDeliveries)
    .set({
      status: "canceled",
      reasonCode,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        inArray(journeyDeliveries.journeyRunId, runIds),
        eq(journeyDeliveries.status, "planned"),
      ),
    );

  const canceledRuns = await tx
    .update(journeyRuns)
    .set({
      status: "canceled",
      cancelledAt: sql`now()`,
    })
    .where(
      and(
        inArray(journeyRuns.id, runIds),
        inArray(journeyRuns.status, [...ACTIVE_RUN_STATUSES]),
      ),
    )
    .returning({ id: journeyRuns.id });

  return canceledRuns.length;
}

async function cancelActiveRunsForJourney(
  tx: DbClient,
  journeyId: string,
  reasonCode: string,
): Promise<number> {
  const versionRows = await tx
    .select({ id: journeyVersions.id })
    .from(journeyVersions)
    .where(eq(journeyVersions.journeyId, journeyId));

  const versionIds = versionRows.map((row) => row.id);
  if (versionIds.length === 0) {
    return 0;
  }

  const runRows = await tx
    .select({ id: journeyRuns.id })
    .from(journeyRuns)
    .where(
      and(
        inArray(journeyRuns.journeyVersionId, versionIds),
        inArray(journeyRuns.status, [...ACTIVE_RUN_STATUSES]),
      ),
    );

  const runIds = runRows.map((row) => row.id);
  return cancelRunsByIds(tx, runIds, reasonCode);
}

export class JourneyService {
  async list(context: ServiceContext): Promise<Journey[]> {
    return withOrg(context.orgId, async (tx) => {
      const rows = await tx
        .select()
        .from(journeys)
        .orderBy(desc(journeys.updatedAt), desc(journeys.id));
      const versionMap = await getJourneyCurrentVersionMap(
        tx,
        rows.map((row) => row.id),
      );

      return rows.map((row) => toJourney(row, versionMap.get(row.id) ?? null));
    });
  }

  async get(id: string, context: ServiceContext): Promise<Journey> {
    return withOrg(context.orgId, async (tx) => {
      const row = await findJourneyById(tx, id);
      if (!row) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      const currentVersion = await getJourneyCurrentVersion(tx, row.id);
      return toJourney(row, currentVersion);
    });
  }

  async create(
    input: CreateJourneyInput,
    context: ServiceContext,
  ): Promise<Journey> {
    const parsed = validateCreateInput(input);

    return withOrg(context.orgId, async (tx) => {
      const name = parsed.name ?? (await generateUntitledName(tx));
      const existing = await findJourneyByNameInsensitive({
        tx,
        orgId: context.orgId,
        name,
      });

      if (existing) {
        throw journeyNameConflictError();
      }

      try {
        const [created] = await tx
          .insert(journeys)
          .values({
            orgId: context.orgId,
            name,
            state: "draft",
            draftDefinition: parsed.graph,
          })
          .returning();

        return toJourney(created!, null);
      } catch (error: unknown) {
        const mapped = mapJourneyWriteError(error);
        if (mapped) {
          throw mapped;
        }

        throw error;
      }
    });
  }

  async update(
    id: string,
    input: UpdateJourneyInput,
    context: ServiceContext,
  ): Promise<Journey> {
    const parsed = validateUpdateInput(input);

    return withOrg(context.orgId, async (tx) => {
      const existing = await findJourneyById(tx, id);
      if (!existing) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      if (parsed.name !== undefined) {
        const conflict = await findJourneyByNameInsensitive({
          tx,
          orgId: context.orgId,
          name: parsed.name,
          excludeId: id,
        });
        if (conflict) {
          throw journeyNameConflictError();
        }
      }

      if (parsed.mode !== undefined && existing.state !== "draft") {
        throw new ApplicationError(
          "Mode can only be updated for draft journeys",
          {
            code: "CONFLICT",
          },
        );
      }

      const shouldCreateVersionSnapshot =
        parsed.graph !== undefined && existing.state !== "draft";
      let nextVersion: number | null = null;
      if (shouldCreateVersionSnapshot) {
        const [nextVersionRow] = await tx
          .select({
            nextVersion: sql<number>`coalesce(max(${journeyVersions.version}), 0) + 1`,
          })
          .from(journeyVersions)
          .where(eq(journeyVersions.journeyId, id));

        nextVersion = nextVersionRow?.nextVersion ?? 1;
      }

      try {
        const [updated] = await tx
          .update(journeys)
          .set({
            name: parsed.name,
            draftDefinition: parsed.graph,
            mode: parsed.mode,
            updatedAt: sql`now()`,
          })
          .where(eq(journeys.id, id))
          .returning();

        if (!updated) {
          throw new ApplicationError("Journey not found", {
            code: "NOT_FOUND",
          });
        }

        if (shouldCreateVersionSnapshot) {
          await tx.insert(journeyVersions).values({
            orgId: context.orgId,
            journeyId: id,
            version: nextVersion ?? 1,
            definitionSnapshot: updated.draftDefinition,
          });
        }
        const currentVersion = shouldCreateVersionSnapshot
          ? (nextVersion ?? 1)
          : await getJourneyCurrentVersion(tx, id);
        return toJourney(updated, currentVersion);
      } catch (error: unknown) {
        const mapped = mapJourneyWriteError(error);
        if (mapped) {
          throw mapped;
        }

        throw error;
      }
    });
  }

  async publish(
    id: string,
    input: PublishJourneyInput,
    context: ServiceContext,
  ): Promise<PublishJourneyResponse> {
    const parsed = validatePublishInput(input);

    return withOrg(context.orgId, async (tx) => {
      const existing = await findJourneyById(tx, id);
      if (!existing) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      if (existing.state !== "draft") {
        throw new ApplicationError("Only draft journeys can be published", {
          code: "CONFLICT",
        });
      }

      const parsedGraph = parseLinearJourneyGraph(existing.draftDefinition);
      await validateClientTriggerCustomAttributeReferences({
        tx,
        orgId: context.orgId,
        graph: parsedGraph,
      });
      validateClientJourneyActionCompatibility(parsedGraph);

      const [nextVersionRow] = await tx
        .select({
          nextVersion: sql<number>`coalesce(max(${journeyVersions.version}), 0) + 1`,
        })
        .from(journeyVersions)
        .where(eq(journeyVersions.journeyId, id));

      const nextVersion = nextVersionRow?.nextVersion ?? 1;

      await tx.insert(journeyVersions).values({
        orgId: context.orgId,
        journeyId: id,
        version: nextVersion,
        definitionSnapshot: existing.draftDefinition,
      });

      const [updated] = await tx
        .update(journeys)
        .set({
          state: "published",
          mode: parsed.mode,
          updatedAt: sql`now()`,
        })
        .where(eq(journeys.id, id))
        .returning();

      if (!updated) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      const warnings = await computePublishOverlapWarnings({
        tx,
        journeyId: id,
        graph: parsedGraph,
      });

      return {
        journey: toJourney(updated, nextVersion),
        version: nextVersion,
        warnings,
      };
    });
  }

  async listRuns(
    id: string,
    query: ListJourneyRunsQuery,
    context: ServiceContext,
  ): Promise<JourneyRun[]> {
    const parsed = validateListRunsQuery(query);

    return withOrg(context.orgId, async (tx) => {
      const existing = await findJourneyById(tx, id);
      if (!existing) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      const versionRows = await tx
        .select({ id: journeyVersions.id })
        .from(journeyVersions)
        .where(eq(journeyVersions.journeyId, id));

      const versionIds = versionRows.map((row) => row.id);
      if (versionIds.length === 0) {
        return [];
      }

      const filters = [inArray(journeyRuns.journeyVersionId, versionIds)];
      if (parsed.mode) {
        filters.push(eq(journeyRuns.mode, parsed.mode));
      }

      const rows = await tx
        .select()
        .from(journeyRuns)
        .where(filters.length > 1 ? and(...filters) : filters[0])
        .orderBy(desc(journeyRuns.startedAt), desc(journeyRuns.id))
        .limit(parsed.limit);

      return rows.map(toJourneyRun);
    });
  }

  async getRun(
    runId: string,
    context: ServiceContext,
  ): Promise<JourneyRunDetailResponse> {
    return withOrg(context.orgId, async (tx) => {
      const [run] = await tx
        .select()
        .from(journeyRuns)
        .where(eq(journeyRuns.id, runId))
        .limit(1);

      if (!run) {
        throw new ApplicationError("Run not found", { code: "NOT_FOUND" });
      }

      const appointmentContextPromise = run.appointmentId
        ? tx
            .select({
              appointmentId: appointments.id,
              calendarId: appointments.calendarId,
              appointmentTypeId: appointments.appointmentTypeId,
              clientId: appointments.clientId,
              startAt: appointments.startAt,
              endAt: appointments.endAt,
              timezone: appointments.timezone,
              status: appointments.status,
              notes: appointments.notes,
              clientFirstName: clients.firstName,
              clientLastName: clients.lastName,
              clientEmail: clients.email,
              clientPhone: clients.phone,
            })
            .from(appointments)
            .leftJoin(clients, eq(clients.id, appointments.clientId))
            .where(eq(appointments.id, run.appointmentId))
            .limit(1)
        : Promise.resolve([]);

      const [deliveries, events, stepLogs, appointmentContext] =
        await Promise.all([
          tx
            .select()
            .from(journeyDeliveries)
            .where(eq(journeyDeliveries.journeyRunId, run.id))
            .orderBy(
              asc(journeyDeliveries.scheduledFor),
              asc(journeyDeliveries.createdAt),
              asc(journeyDeliveries.id),
            ),
          tx
            .select()
            .from(journeyRunEvents)
            .where(eq(journeyRunEvents.journeyRunId, run.id))
            .orderBy(asc(journeyRunEvents.createdAt), asc(journeyRunEvents.id)),
          tx
            .select()
            .from(journeyRunStepLogs)
            .where(eq(journeyRunStepLogs.journeyRunId, run.id))
            .orderBy(
              asc(journeyRunStepLogs.startedAt),
              asc(journeyRunStepLogs.id),
            ),
          appointmentContextPromise,
        ]);

      const [appointmentRow] = appointmentContext;
      const appointment = appointmentRow
        ? {
            id: appointmentRow.appointmentId,
            calendarId: appointmentRow.calendarId,
            appointmentTypeId: appointmentRow.appointmentTypeId,
            clientId: appointmentRow.clientId,
            startAt: appointmentRow.startAt,
            endAt: appointmentRow.endAt,
            timezone: appointmentRow.timezone,
            status: appointmentRow.status,
            notes: appointmentRow.notes,
          }
        : null;
      let client: {
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
        phone: string | null;
      } | null = null;

      if (
        appointmentRow?.clientId &&
        appointmentRow.clientFirstName &&
        appointmentRow.clientLastName
      ) {
        client = {
          id: appointmentRow.clientId,
          firstName: appointmentRow.clientFirstName,
          lastName: appointmentRow.clientLastName,
          email: appointmentRow.clientEmail,
          phone: appointmentRow.clientPhone,
        };
      } else if (!appointmentRow && run.clientId) {
        const [clientRow] = await tx
          .select({
            id: clients.id,
            firstName: clients.firstName,
            lastName: clients.lastName,
            email: clients.email,
            phone: clients.phone,
          })
          .from(clients)
          .where(eq(clients.id, run.clientId))
          .limit(1);

        if (clientRow) {
          client = clientRow;
        }
      }
      const triggerContext = toJourneyRunTriggerContext({
        eventType: resolveTriggerEventType({ events, stepLogs }),
        payload: resolveTriggerPayload({ events, stepLogs }),
        appointment,
        client,
      });

      return {
        run: toJourneyRun(run),
        runSnapshot: run.journeyVersionSnapshot,
        deliveries: deliveries.map(toJourneyRunDelivery),
        events: events.map(toJourneyRunEvent),
        stepLogs: stepLogs.map(toJourneyRunStepLog),
        triggerContext,
      };
    });
  }

  async cancelRun(
    runId: string,
    context: ServiceContext,
  ): Promise<CancelJourneyRunResponse> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await findRunById(tx, runId);
      if (!existing) {
        throw new ApplicationError("Run not found", { code: "NOT_FOUND" });
      }

      if (!ACTIVE_RUN_STATUS_SET.has(existing.status)) {
        return cancelJourneyRunResponseSchema.parse({
          run: toJourneyRun(existing),
          canceled: false,
        });
      }

      await cancelRunsByIds(tx, [runId], "manual_cancel");

      const updated = await findRunById(tx, runId);
      if (!updated) {
        throw new ApplicationError("Run not found", { code: "NOT_FOUND" });
      }

      return cancelJourneyRunResponseSchema.parse({
        run: toJourneyRun(updated),
        canceled: true,
      });
    });
  }

  async cancelRuns(
    id: string,
    context: ServiceContext,
  ): Promise<CancelJourneyRunsResponse> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await findJourneyById(tx, id);
      if (!existing) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      const canceledRunCount = await cancelActiveRunsForJourney(
        tx,
        id,
        "manual_cancel",
      );

      return cancelJourneyRunsResponseSchema.parse({
        success: true,
        canceledRunCount,
      });
    });
  }

  async pause(id: string, context: ServiceContext): Promise<Journey> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await findJourneyById(tx, id);
      if (!existing) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      if (existing.state !== "published") {
        throw new ApplicationError("Only published journeys can be paused", {
          code: "CONFLICT",
        });
      }

      await cancelActiveRunsForJourney(tx, id, "manual_cancel");

      const [updated] = await tx
        .update(journeys)
        .set({
          state: "paused",
          updatedAt: sql`now()`,
        })
        .where(eq(journeys.id, id))
        .returning();

      if (!updated) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      const currentVersion = await getJourneyCurrentVersion(tx, id);
      return toJourney(updated, currentVersion);
    });
  }

  async resume(id: string, context: ServiceContext): Promise<Journey> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await findJourneyById(tx, id);
      if (!existing) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      if (existing.state !== "paused") {
        throw new ApplicationError("Only paused journeys can be resumed", {
          code: "CONFLICT",
        });
      }

      const [updated] = await tx
        .update(journeys)
        .set({
          state: "published",
          updatedAt: sql`now()`,
        })
        .where(eq(journeys.id, id))
        .returning();

      if (!updated) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      const currentVersion = await getJourneyCurrentVersion(tx, id);
      return toJourney(updated, currentVersion);
    });
  }

  async setMode(
    id: string,
    input: SetJourneyModeInput,
    context: ServiceContext,
  ): Promise<Journey> {
    const parsed = validateSetModeInput(input);

    return withOrg(context.orgId, async (tx) => {
      const existing = await findJourneyById(tx, id);
      if (!existing) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      if (existing.state !== "published") {
        throw new ApplicationError(
          "Mode can only be changed for published journeys",
          {
            code: "CONFLICT",
          },
        );
      }

      const [updated] = await tx
        .update(journeys)
        .set({
          mode: parsed.mode,
          updatedAt: sql`now()`,
        })
        .where(eq(journeys.id, id))
        .returning();

      if (!updated) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      const currentVersion = await getJourneyCurrentVersion(tx, id);
      return toJourney(updated, currentVersion);
    });
  }

  async startTestRun(
    id: string,
    input: StartJourneyTestRunInput,
    context: ServiceContext,
  ): Promise<StartJourneyTestRunResponse> {
    const parsed = validateStartTestRunInput(input);

    const eventPayload = await withOrg(context.orgId, async (tx) => {
      const existing = await findJourneyById(tx, id);
      if (!existing) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      if (existing.state === "draft" || existing.state === "paused") {
        throw new ApplicationError(
          "Journey must be published before starting a test run",
          {
            code: "CONFLICT",
          },
        );
      }

      const [latestVersion] = await tx
        .select({
          id: journeyVersions.id,
          definitionSnapshot: journeyVersions.definitionSnapshot,
        })
        .from(journeyVersions)
        .where(eq(journeyVersions.journeyId, id))
        .orderBy(desc(journeyVersions.version), desc(journeyVersions.id))
        .limit(1);

      if (!latestVersion) {
        throw new ApplicationError(
          "Journey must be published before starting a test run",
          {
            code: "CONFLICT",
          },
        );
      }

      parseLinearJourneyGraph(latestVersion.definitionSnapshot);

      const [appointment] = await tx
        .select({
          appointment: {
            id: appointments.id,
            calendarId: appointments.calendarId,
            calendarRequiresConfirmation: calendars.requiresConfirmation,
            appointmentTypeId: appointments.appointmentTypeId,
            clientId: appointments.clientId,
            startAt: appointments.startAt,
            endAt: appointments.endAt,
            timezone: appointments.timezone,
            status: appointments.status,
            notes: appointments.notes,
          },
          client: {
            id: clients.id,
            firstName: clients.firstName,
            lastName: clients.lastName,
            email: clients.email,
            phone: clients.phone,
          },
        })
        .from(appointments)
        .leftJoin(calendars, eq(calendars.id, appointments.calendarId))
        .innerJoin(clients, eq(appointments.clientId, clients.id))
        .where(eq(appointments.id, parsed.appointmentId))
        .limit(1);

      if (!appointment) {
        throw new ApplicationError("Appointment not found", {
          code: "NOT_FOUND",
        });
      }

      const customAttributes =
        await clientCustomAttributeService.loadClientCustomAttributes(
          tx,
          context.orgId,
          appointment.client.id,
        );

      return mapAppointmentToScheduledPayload({
        appointment: {
          ...appointment.appointment,
          calendarRequiresConfirmation:
            appointment.appointment.calendarRequiresConfirmation ?? false,
        },
        client: { ...appointment.client, customAttributes },
      });
    });

    const now = new Date();
    const plannerResult = await processJourneyDomainEvent(
      {
        id: Bun.randomUUIDv7(),
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: eventPayload,
        timestamp: now.toISOString(),
      },
      {
        now,
        journeyIds: [id],
        modeOverride: "test",
      },
    );

    const runId = plannerResult.plannedRunIds[0];
    if (!runId) {
      throw new ApplicationError("Journey test run could not be started", {
        code: "CONFLICT",
      });
    }

    return {
      runId,
      mode: "test",
    };
  }

  async delete(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await findJourneyById(tx, id);
      if (!existing) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      await cancelActiveRunsForJourney(tx, id, "manual_cancel");

      await tx.delete(journeys).where(eq(journeys.id, id));

      return { success: true };
    });
  }
}

export const journeyService = new JourneyService();
