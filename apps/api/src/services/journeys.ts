import {
  cancelJourneyRunResponseSchema,
  cancelJourneyRunsResponseSchema,
  createJourneySchema,
  domainEventDataSchemaByType,
  journeyTriggerConfigSchema,
  linearJourneyGraphSchema,
  listJourneyRunsQuerySchema,
  publishJourneySchema,
  resumeJourneySchema,
  startJourneyTestRunSchema,
  updateJourneySchema,
  type CreateJourneyInput,
  type CancelJourneyRunResponse,
  type CancelJourneyRunsResponse,
  type Journey,
  type JourneyRun,
  type JourneyRunDelivery,
  type JourneyRunDetailResponse,
  type LinearJourneyGraph,
  type ListJourneyRunsQuery,
  type PublishJourneyInput,
  type PublishJourneyResponse,
  type ResumeJourneyInput,
  type StartJourneyTestRunInput,
  type StartJourneyTestRunResponse,
  type JourneyTriggerConfig,
  type UpdateJourneyInput,
} from "@scheduling/dto";
import {
  appointments,
  journeyDeliveries,
  journeyRuns,
  journeys,
  journeyVersions,
} from "@scheduling/db/schema";
import { compact, uniq } from "es-toolkit/array";
import { and, asc, desc, eq, ilike, inArray, ne, sql } from "drizzle-orm";
import { ApplicationError } from "../errors/application-error.js";
import { withOrg, type DbClient } from "../lib/db.js";
import type { ServiceContext } from "./locations.js";
import { processJourneyDomainEvent } from "./journey-planner.js";

const UNIQUE_CONSTRAINT_VIOLATION = "23505";
const JOURNEY_NAME_UNIQUE_CONSTRAINT = "journeys_org_name_ci_uidx";
const ACTIVE_RUN_STATUSES = ["planned", "running"] as const;
const ACTIVE_RUN_STATUS_SET = new Set<string>(ACTIVE_RUN_STATUSES);
const OVERLAP_CANDIDATE_STATES = ["published", "test_only", "paused"] as const;
const JOURNEY_DEFINITION_INVALID_CODE = "JOURNEY_DEFINITION_INVALID";
const HIGH_SIGNAL_FILTER_FIELDS = new Set([
  "appointment.calendarId",
  "appointment.appointmentTypeId",
  "appointment.clientId",
]);

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("code" in error && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
    return true;
  }

  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const { cause } = error;
    if ("errno" in cause && cause.errno === UNIQUE_CONSTRAINT_VIOLATION) {
      return true;
    }
    if ("code" in cause && cause.code === UNIQUE_CONSTRAINT_VIOLATION) {
      return true;
    }
  }

  return false;
}

function getConstraintName(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  if ("constraint" in error && typeof error.constraint === "string") {
    return error.constraint;
  }

  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const { cause } = error;
    if ("constraint" in cause && typeof cause.constraint === "string") {
      return cause.constraint;
    }
  }

  return null;
}

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

function toJourney(row: typeof journeys.$inferSelect): Journey {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    state: row.state,
    graph: parseLinearJourneyGraph(row.draftDefinition),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
  return uniq([config.start, config.restart]);
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

function validateResumeInput(input: ResumeJourneyInput): ResumeJourneyInput {
  const parsed = resumeJourneySchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid resume payload", {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function normalizeActionType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

function journeyIncludesEmailSendStep(graph: LinearJourneyGraph): boolean {
  return graph.nodes.some((node) => {
    if (node.attributes.data.type !== "action") {
      return false;
    }

    const config = toRecord(node.attributes.data.config);
    const actionType = normalizeActionType(config["actionType"]);
    return (
      actionType === "send-resend" || actionType === "send-resend-template"
    );
  });
}

function mapAppointmentToScheduledPayload(
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
  >,
) {
  const parsed = domainEventDataSchemaByType["appointment.scheduled"].safeParse(
    {
      appointmentId: appointment.id,
      calendarId: appointment.calendarId,
      appointmentTypeId: appointment.appointmentTypeId,
      clientId: appointment.clientId,
      startAt: appointment.startAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
      timezone: appointment.timezone,
      status: appointment.status,
      notes: appointment.notes,
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

      return rows.map(toJourney);
    });
  }

  async get(id: string, context: ServiceContext): Promise<Journey> {
    return withOrg(context.orgId, async (tx) => {
      const row = await findJourneyById(tx, id);
      if (!row) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      return toJourney(row);
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

        return toJourney(created!);
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

      try {
        const [updated] = await tx
          .update(journeys)
          .set({
            name: parsed.name,
            draftDefinition: parsed.graph,
            updatedAt: sql`now()`,
          })
          .where(eq(journeys.id, id))
          .returning();

        if (!updated) {
          throw new ApplicationError("Journey not found", {
            code: "NOT_FOUND",
          });
        }

        return toJourney(updated);
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

      if (existing.state === "paused") {
        throw new ApplicationError(
          "Paused journeys must be resumed before publish",
          {
            code: "CONFLICT",
          },
        );
      }

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

      const targetState = parsed.mode === "test" ? "test_only" : "published";
      const [updated] = await tx
        .update(journeys)
        .set({
          state: targetState,
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
        graph: parseLinearJourneyGraph(existing.draftDefinition),
      });

      return {
        journey: toJourney(updated),
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

      const deliveries = await tx
        .select()
        .from(journeyDeliveries)
        .where(eq(journeyDeliveries.journeyRunId, run.id))
        .orderBy(
          asc(journeyDeliveries.scheduledFor),
          asc(journeyDeliveries.createdAt),
          asc(journeyDeliveries.id),
        );

      return {
        run: toJourneyRun(run),
        runSnapshot: run.journeyVersionSnapshot,
        deliveries: deliveries.map(toJourneyRunDelivery),
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

      if (existing.state !== "published" && existing.state !== "test_only") {
        throw new ApplicationError(
          "Only published or test-only journeys can be paused",
          {
            code: "CONFLICT",
          },
        );
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

      return toJourney(updated);
    });
  }

  async resume(
    id: string,
    input: ResumeJourneyInput,
    context: ServiceContext,
  ): Promise<Journey> {
    const parsed = validateResumeInput(input);

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
          state: parsed.targetState,
          updatedAt: sql`now()`,
        })
        .where(eq(journeys.id, id))
        .returning();

      if (!updated) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      return toJourney(updated);
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

      const parsedGraph = parseLinearJourneyGraph(
        latestVersion.definitionSnapshot,
      );

      if (journeyIncludesEmailSendStep(parsedGraph) && !parsed.emailOverride) {
        throw new ApplicationError(
          "Email override is required for test runs with Email steps",
          {
            code: "BAD_REQUEST",
            details: { field: "emailOverride" },
          },
        );
      }

      const [appointment] = await tx
        .select({
          id: appointments.id,
          calendarId: appointments.calendarId,
          appointmentTypeId: appointments.appointmentTypeId,
          clientId: appointments.clientId,
          startAt: appointments.startAt,
          endAt: appointments.endAt,
          timezone: appointments.timezone,
          status: appointments.status,
          notes: appointments.notes,
        })
        .from(appointments)
        .where(eq(appointments.id, parsed.appointmentId))
        .limit(1);

      if (!appointment) {
        throw new ApplicationError("Appointment not found", {
          code: "NOT_FOUND",
        });
      }

      return mapAppointmentToScheduledPayload(appointment);
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
