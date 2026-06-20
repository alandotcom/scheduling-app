import {
  cancelJourneyRunResponseSchema,
  cancelJourneyRunsResponseSchema,
  type CreateJourneyInput,
  type CancelJourneyRunResponse,
  type CancelJourneyRunsResponse,
  type Journey,
  type JourneyRunListItem,
  type JourneyRunDetailResponse,
  type ListJourneyRunsQuery,
  type ListJourneyRunsByEntityQuery,
  type PublishJourneyInput,
  type PublishJourneyResponse,
  type SetJourneyModeInput,
  type StartJourneyTestRunInput,
  type StartJourneyTestRunResponse,
  type UpdateJourneyInput,
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
import { ApplicationError } from "../../errors/application-error.js";
import { withOrg, type DbClient } from "../../lib/db.js";
import {
  isUniqueConstraintViolation,
  getConstraintName,
} from "../../lib/db-errors.js";
import type { ServiceContext } from "../locations.js";
import { clientCustomAttributeService } from "../client-custom-attributes.js";
import { processJourneyDomainEvent } from "./journey-planner.js";
import {
  buildJourneyRunListItems,
  getJourneyIdByVersionIdMap,
  resolveTriggerEventType,
  resolveTriggerPayload,
  toJourneyRun,
  toJourneyRunDelivery,
  toJourneyRunEvent,
  toJourneyRunStepLog,
  toJourneyRunTriggerContext,
} from "./journey-run-overlay.js";
import {
  computePublishOverlapWarnings,
  parseLinearJourneyGraph,
  validateClientJourneyActionCompatibility,
  validateClientTriggerCustomAttributeReferences,
  validateCreateInput,
  validateListRunsByEntityQuery,
  validateListRunsQuery,
  validatePublishInput,
  validateSetModeInput,
  validateUpdateInput,
} from "./journey-validation.js";
import {
  ACTIVE_RUN_STATUS_SET,
  cancelActiveRunsForJourney,
  cancelRunsByIds,
  emitJourneyRunCancels,
  findRunById,
} from "./journey-run-cancellation.js";
import {
  mapAppointmentToScheduledPayload,
  validateStartTestRunInput,
} from "./journey-test-run.js";

const JOURNEY_NAME_UNIQUE_CONSTRAINT = "journeys_org_name_ci_uidx";

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
  ): Promise<JourneyRunListItem[]> {
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

      return buildJourneyRunListItems({
        tx,
        runs: rows,
        resolveJourneyId: () => id,
      });
    });
  }

  async listRunsByEntity(
    query: ListJourneyRunsByEntityQuery,
    context: ServiceContext,
  ): Promise<JourneyRunListItem[]> {
    const parsed = validateListRunsByEntityQuery(query);

    return withOrg(context.orgId, async (tx) => {
      const entityFilter =
        parsed.entityType === "appointment"
          ? eq(journeyRuns.appointmentId, parsed.entityId)
          : eq(journeyRuns.clientId, parsed.entityId);
      const filters = [entityFilter];
      if (parsed.mode) {
        filters.push(eq(journeyRuns.mode, parsed.mode));
      }

      const rows = await tx
        .select({ run: journeyRuns })
        .from(journeyRuns)
        .where(filters.length > 1 ? and(...filters) : filters[0])
        .orderBy(desc(journeyRuns.startedAt), desc(journeyRuns.id))
        .limit(parsed.limit);

      const runs = rows.map((row) => row.run);
      const journeyVersionIds = compact(
        uniq(runs.map((run) => run.journeyVersionId)),
      );
      const journeyIdByVersionId = await getJourneyIdByVersionIdMap(
        tx,
        journeyVersionIds,
      );

      return buildJourneyRunListItems({
        tx,
        runs,
        resolveJourneyId: (run) =>
          run.journeyVersionId
            ? (journeyIdByVersionId.get(run.journeyVersionId) ?? null)
            : null,
      });
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
    let canceledIds: string[] = [];
    const result = await withOrg(context.orgId, async (tx) => {
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

      canceledIds = await cancelRunsByIds(tx, [runId], "manual_cancel");

      const updated = await findRunById(tx, runId);
      if (!updated) {
        throw new ApplicationError("Run not found", { code: "NOT_FOUND" });
      }

      return cancelJourneyRunResponseSchema.parse({
        run: toJourneyRun(updated),
        canceled: true,
      });
    });
    await emitJourneyRunCancels(context.orgId, canceledIds);
    return result;
  }

  async cancelRuns(
    id: string,
    context: ServiceContext,
  ): Promise<CancelJourneyRunsResponse> {
    let canceledIds: string[] = [];
    const result = await withOrg(context.orgId, async (tx) => {
      const existing = await findJourneyById(tx, id);
      if (!existing) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      canceledIds = await cancelActiveRunsForJourney(tx, id, "manual_cancel");

      return cancelJourneyRunsResponseSchema.parse({
        success: true,
        canceledRunCount: canceledIds.length,
      });
    });
    await emitJourneyRunCancels(context.orgId, canceledIds);
    return result;
  }

  async pause(id: string, context: ServiceContext): Promise<Journey> {
    let canceledIds: string[] = [];
    const result = await withOrg(context.orgId, async (tx) => {
      const existing = await findJourneyById(tx, id);
      if (!existing) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      if (existing.state !== "published") {
        throw new ApplicationError("Only published journeys can be paused", {
          code: "CONFLICT",
        });
      }

      canceledIds = await cancelActiveRunsForJourney(tx, id, "manual_cancel");

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
    await emitJourneyRunCancels(context.orgId, canceledIds);
    return result;
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
    let canceledIds: string[] = [];
    const result = await withOrg(context.orgId, async (tx) => {
      const existing = await findJourneyById(tx, id);
      if (!existing) {
        throw new ApplicationError("Journey not found", { code: "NOT_FOUND" });
      }

      canceledIds = await cancelActiveRunsForJourney(tx, id, "manual_cancel");

      await tx.delete(journeys).where(eq(journeys.id, id));

      return { success: true as const };
    });
    await emitJourneyRunCancels(context.orgId, canceledIds);
    return result;
  }
}

export const journeyService = new JourneyService();
