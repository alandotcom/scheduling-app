import { forEachAsync } from "es-toolkit/array";
import { getLogger } from "@logtape/logtape";
import {
  linearJourneyGraphSchema,
  type JourneyTriggerConfig,
  type LinearJourneyGraph,
  type TriggerBranch,
} from "@scheduling/dto";
import {
  clients,
  journeyRuns,
  orgs,
  journeys,
  journeyVersions,
} from "@scheduling/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { withOrg, type DbClient } from "../lib/db.js";
import { customAttributeRepository } from "../repositories/custom-attributes.js";
import {
  sendJourneyRunStart,
  type JourneyRunStartEventData,
} from "../inngest/runtime-events.js";
import {
  buildOutgoingEdgesBySource,
  getTriggerNode,
  resolveTriggerNextNodeIds,
} from "./journey-graph-walk.js";
import { evaluateJourneyTriggerFilter } from "./journey-trigger-filters.js";
import { appendJourneyRunEvent } from "./journey-run-artifacts.js";
import {
  resolveJourneyTriggerRuntime,
  type JourneyPlannerDomainEventPayload,
  type JourneyPlannerDomainEventType,
  type JourneyRunIdentity,
} from "./journey-trigger-engines.js";

export type { JourneyPlannerDomainEventType };

// The journey planner is the dispatcher half of the Inngest-native engine: it
// reacts to a domain event by resolving which journeys it starts/restarts/stops
// and emitting one `journey.run.start` event per run. The run itself is walked
// by the `journey-run` Inngest function (see `journey-run-executor.ts`); this
// module owns run identity, lifecycle transitions at the boundary, and the
// after-commit event dispatch.

const ACTIVE_JOURNEY_STATES = ["published"] as const;
const ACTIVE_RUN_STATUSES = ["planned", "running"] as const;
const DEFAULT_ORG_TIMEZONE = "UTC";
const journeyPlannerLogger = getLogger(["journeys", "planner"]);
const BUILT_IN_CLIENT_TRACKED_ATTRIBUTE_KEYS = [
  "client.id",
  "client.firstName",
  "client.lastName",
  "client.email",
  "client.phone",
] as const;

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
  ignoredJourneyIds: string[];
  erroredJourneyIds: string[];
};

type JourneyPlannerDependencies = {
  runStartRequester?: (
    payload: JourneyRunStartEventData,
  ) => Promise<{ eventId?: string }>;
  now?: Date;
  journeyIds?: readonly string[];
  modeOverride?: "live" | "test";
};

type JourneyRow = Pick<typeof journeys.$inferSelect, "id" | "name" | "mode">;

type JourneyVersionRow = Pick<
  typeof journeyVersions.$inferSelect,
  "id" | "journeyId" | "version" | "definitionSnapshot" | "publishedAt"
>;

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

// Cancellation projection. `cancelOn` stops the in-flight `journey-run` function,
// but the DB run row (which the overlay reads) is a separate concern: this marks
// the active run(s) for the entity canceled and records a run event. Matches by
// journey + entity + mode across versions so a mid-run republish does not leave
// an orphaned active run behind.
async function cancelActiveInngestRunsForJourney(input: {
  tx: DbClient;
  orgId: string;
  journeyId: string;
  runIdentity: JourneyRunIdentity;
  mode: "live" | "test";
  eventId: string;
}): Promise<string[]> {
  const activeRuns = await input.tx
    .select({ id: journeyRuns.id })
    .from(journeyRuns)
    .innerJoin(
      journeyVersions,
      eq(journeyVersions.id, journeyRuns.journeyVersionId),
    )
    .where(
      and(
        eq(journeyVersions.journeyId, input.journeyId),
        eq(journeyRuns.triggerEntityType, input.runIdentity.triggerEntityType),
        eq(journeyRuns.triggerEntityId, input.runIdentity.triggerEntityId),
        eq(journeyRuns.mode, input.mode),
        inArray(journeyRuns.status, [...ACTIVE_RUN_STATUSES]),
      ),
    );

  if (activeRuns.length === 0) {
    return [];
  }

  const runIds = activeRuns.map((row) => row.id);
  await input.tx
    .update(journeyRuns)
    .set({ status: "canceled", cancelledAt: sql`now()` })
    .where(inArray(journeyRuns.id, runIds));

  await forEachAsync(
    runIds,
    (runId) =>
      appendJourneyRunEvent({
        tx: input.tx,
        orgId: input.orgId,
        runId,
        eventType: "run_canceled",
        message: "Run canceled by trigger event",
        metadata: { eventId: input.eventId },
      }),
    { concurrency: 1 },
  );

  return runIds;
}

type InngestDispatchOutcome =
  | { status: "ignored" }
  | { status: "errored" }
  | { status: "canceled" }
  | { status: "started"; runId: string; payload: JourneyRunStartEventData };

// Insert a fresh active run and build its journey.run.start payload. The partial
// unique index (active statuses only) means this succeeds as long as no other
// active run holds the identity; a concurrent dispatcher that already started
// one wins and this no-ops (its own run-start, plus the function idempotency
// key, prevent duplicates).
async function insertFreshInngestRun(input: {
  tx: DbClient;
  orgId: string;
  journey: JourneyRow;
  journeyVersion: JourneyVersionRow;
  runIdentity: JourneyRunIdentity;
  mode: "live" | "test";
  triggerBranch: TriggerBranch;
  triggerEventType: JourneyPlannerDomainEventType;
  eventTimestamp: string;
}): Promise<InngestDispatchOutcome> {
  let persistedIdentity = input.runIdentity;
  if (
    input.runIdentity.triggerEntityType === "appointment" &&
    input.runIdentity.clientId
  ) {
    const [clientRow] = await input.tx
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, input.runIdentity.clientId))
      .limit(1);
    if (!clientRow) {
      persistedIdentity = { ...input.runIdentity, clientId: null };
    }
  }

  const [created] = await input.tx
    .insert(journeyRuns)
    .values({
      orgId: input.orgId,
      journeyVersionId: input.journeyVersion.id,
      triggerEntityType: persistedIdentity.triggerEntityType,
      triggerEntityId: persistedIdentity.triggerEntityId,
      appointmentId: persistedIdentity.appointmentId,
      clientId: persistedIdentity.clientId,
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
        journeyRuns.triggerEntityType,
        journeyRuns.triggerEntityId,
        journeyRuns.mode,
      ],
      where: sql`${journeyRuns.status} in ('planned', 'running')`,
    })
    .returning();

  if (!created) {
    // A concurrent dispatcher already started the run; it owns the run-start.
    return { status: "ignored" };
  }

  await appendJourneyRunEvent({
    tx: input.tx,
    orgId: input.orgId,
    runId: created.id,
    eventType: "run_created",
    message: "Run created",
    metadata: {
      journeyId: input.journey.id,
      journeyVersion: input.journeyVersion.version,
      mode: input.mode,
      eventType: input.triggerEventType,
    },
  });

  return {
    status: "started",
    runId: created.id,
    payload: {
      orgId: input.orgId,
      journeyRunId: created.id,
      journeyId: input.journey.id,
      journeyVersionId: input.journeyVersion.id,
      triggerEntityType: persistedIdentity.triggerEntityType,
      triggerEntityId: persistedIdentity.triggerEntityId,
      appointmentId: persistedIdentity.appointmentId,
      clientId: persistedIdentity.clientId,
      mode: input.mode,
      triggerBranch: input.triggerBranch,
      triggerEventType: input.triggerEventType,
      eventTimestamp: input.eventTimestamp,
    },
  };
}

// Translate one journey's trigger routing into run lifecycle: start/restart
// cancels any in-flight run and starts a fresh scheduled run (cancel-and-restart);
// stop/no_show cancels the in-flight run and starts the terminal branch when it
// has nodes; non-start/stop events (e.g. appointment.confirmed) no-op because the
// running function reacts via waitForEvent / cancelOn.
async function dispatchInngestJourneyRun(input: {
  tx: DbClient;
  orgId: string;
  journey: JourneyRow;
  journeyVersion: JourneyVersionRow;
  graph: LinearJourneyGraph;
  triggerResolution: ReturnType<typeof resolveJourneyTriggerRuntime>;
  validClientAttributeKeys: Set<string> | null;
  mode: "live" | "test";
  now: Date;
  orgTimezone: string;
  eventType: JourneyPlannerDomainEventType;
  eventId: string;
  eventTimestamp: string;
}): Promise<InngestDispatchOutcome> {
  const resolution = input.triggerResolution;
  if (
    resolution.status === "invalid_config" ||
    resolution.status === "unsupported_trigger_type"
  ) {
    return { status: "ignored" };
  }
  if (resolution.status === "missing_run_identity") {
    return { status: "errored" };
  }

  const { triggerConfig, routing } = resolution;
  const invalidTrackedAttributeReason = resolveInvalidTrackedAttributeReason({
    triggerConfig,
    validClientAttributeKeys: input.validClientAttributeKeys,
  });
  if (invalidTrackedAttributeReason) {
    journeyPlannerLogger.error(
      "Journey trigger config invalid for journey {journeyId}: {reason}",
      { journeyId: input.journey.id, reason: invalidTrackedAttributeReason },
    );
    return { status: "errored" };
  }

  if (routing === "ignore") {
    return { status: "ignored" };
  }

  const { runIdentity } = resolution;
  const outgoingEdgesBySource = buildOutgoingEdgesBySource(input.graph);
  const triggerNode = getTriggerNode(input.graph);

  const cancelActive = () =>
    cancelActiveInngestRunsForJourney({
      tx: input.tx,
      orgId: input.orgId,
      journeyId: input.journey.id,
      runIdentity,
      mode: input.mode,
      eventId: input.eventId,
    });

  if (routing === "cancel") {
    // Stop/no_show: cancel the in-flight run, then start the terminal branch if
    // it has nodes (e.g. a cancellation notice).
    await cancelActive();
    const terminalBranch = resolution.triggerBranch;
    const terminalTargets = triggerNode
      ? resolveTriggerNextNodeIds({
          sourceNodeId: triggerNode.attributes.id,
          branch: terminalBranch,
          outgoingEdgesBySource,
        })
      : [];
    if (terminalTargets.length === 0) {
      return { status: "canceled" };
    }
    return insertFreshInngestRun({
      tx: input.tx,
      orgId: input.orgId,
      journey: input.journey,
      journeyVersion: input.journeyVersion,
      runIdentity,
      mode: input.mode,
      triggerBranch: terminalBranch,
      triggerEventType: input.eventType,
      eventTimestamp: input.eventTimestamp,
    });
  }

  // routing === "plan": a restart event (appointment.rescheduled) cancels the
  // in-flight run and starts fresh; a start event (appointment.scheduled,
  // client.*) is idempotent — insertFreshInngestRun no-ops when an active run
  // already holds the identity.
  const isRestart =
    triggerConfig.triggerType === "AppointmentJourney" &&
    input.eventType === triggerConfig.restart;
  if (isRestart) {
    await cancelActive();
  }

  if (triggerConfig.filter) {
    const filterResult = evaluateJourneyTriggerFilter({
      filter: triggerConfig.filter,
      context: {
        appointment: resolution.appointmentContext,
        client: resolution.clientContext,
      },
      now: input.now,
      orgTimezone: input.orgTimezone,
    });
    if (!filterResult.matched) {
      return { status: isRestart ? "canceled" : "ignored" };
    }
  }

  return insertFreshInngestRun({
    tx: input.tx,
    orgId: input.orgId,
    journey: input.journey,
    journeyVersion: input.journeyVersion,
    runIdentity,
    mode: input.mode,
    triggerBranch: "scheduled",
    triggerEventType: input.eventType,
    eventTimestamp: input.eventTimestamp,
  });
}

export async function processJourneyDomainEvent(
  event: JourneyDomainEventEnvelope,
  dependencies: JourneyPlannerDependencies = {},
): Promise<JourneyPlannerResult> {
  const runStartRequester =
    dependencies.runStartRequester ?? sendJourneyRunStart;
  const now = dependencies.now ?? new Date();
  const requestedJourneyIds =
    dependencies.journeyIds && dependencies.journeyIds.length > 0
      ? [...new Set(dependencies.journeyIds)]
      : null;

  const { result, pendingRunStarts } = await withOrg(
    event.orgId,
    async (tx) => {
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
          mode: journeys.mode,
        })
        .from(journeys)
        .where(
          journeyFilters.length > 1
            ? and(...journeyFilters)
            : journeyFilters[0],
        );

      const emptyResult: JourneyPlannerResult = {
        eventId: event.id,
        eventType: event.type,
        orgId: event.orgId,
        plannedRunIds: [],
        ignoredJourneyIds: [],
        erroredJourneyIds: [],
      };

      if (activeJourneys.length === 0) {
        return {
          result: emptyResult,
          pendingRunStarts: [] as JourneyRunStartEventData[],
        };
      }

      // Only the latest version per journey is used, so fetch exactly that with
      // DISTINCT ON instead of pulling every historical version's full graph
      // snapshot and discarding all but the newest in app code.
      const versions = await tx
        .selectDistinctOn([journeyVersions.journeyId], {
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
        .orderBy(
          journeyVersions.journeyId,
          desc(journeyVersions.version),
          desc(journeyVersions.id),
        );

      const [org] = await tx
        .select({ defaultTimezone: orgs.defaultTimezone })
        .from(orgs)
        .where(eq(orgs.id, event.orgId))
        .limit(1);
      const orgTimezone = org?.defaultTimezone ?? DEFAULT_ORG_TIMEZONE;

      const validClientAttributeKeys =
        event.type === "client.updated"
          ? new Set([
              ...BUILT_IN_CLIENT_TRACKED_ATTRIBUTE_KEYS,
              ...(
                await customAttributeRepository.listDefinitions(tx, event.orgId)
              ).map((definition) => definition.fieldKey),
            ])
          : null;

      const latestVersionByJourneyId = new Map<string, JourneyVersionRow>();
      for (const version of versions) {
        if (!latestVersionByJourneyId.has(version.journeyId)) {
          latestVersionByJourneyId.set(version.journeyId, version);
        }
      }

      const plannedRunIds: string[] = [];
      const ignoredJourneyIds: string[] = [];
      const erroredJourneyIds: string[] = [];
      const runStartPayloads: JourneyRunStartEventData[] = [];

      await forEachAsync(
        activeJourneys,
        async (journey) => {
          try {
            const latestVersion = latestVersionByJourneyId.get(journey.id);
            if (!latestVersion) {
              ignoredJourneyIds.push(journey.id);
              return;
            }

            const parsedGraph = linearJourneyGraphSchema.safeParse(
              latestVersion.definitionSnapshot,
            );
            if (!parsedGraph.success) {
              erroredJourneyIds.push(journey.id);
              return;
            }

            const outcome = await dispatchInngestJourneyRun({
              tx,
              orgId: event.orgId,
              journey,
              journeyVersion: latestVersion,
              graph: parsedGraph.data,
              triggerResolution: resolveJourneyTriggerRuntime({
                graph: parsedGraph.data,
                eventType: event.type,
                payload: event.payload,
              }),
              validClientAttributeKeys,
              mode: dependencies.modeOverride ?? journey.mode,
              now,
              orgTimezone,
              eventType: event.type,
              eventId: event.id,
              eventTimestamp: event.timestamp,
            });

            if (outcome.status === "errored") {
              erroredJourneyIds.push(journey.id);
            } else if (outcome.status === "ignored") {
              ignoredJourneyIds.push(journey.id);
            } else if (outcome.status === "canceled") {
              // Cancellation projection only; nothing further to dispatch.
            } else {
              plannedRunIds.push(outcome.runId);
              runStartPayloads.push(outcome.payload);
            }
          } catch (error) {
            journeyPlannerLogger.error(
              "Failed processing journey {journeyId} for event {eventType}: {error}",
              {
                journeyId: journey.id,
                eventType: event.type,
                eventId: event.id,
                error,
                errorStack: error instanceof Error ? error.stack : undefined,
              },
            );
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
          ignoredJourneyIds,
          erroredJourneyIds,
        },
        pendingRunStarts: runStartPayloads,
      };
    },
  );

  // Fire run-start events after the transaction has committed.
  await forEachAsync(
    pendingRunStarts,
    async (payload) => {
      await runStartRequester(payload);
    },
    { concurrency: 1 },
  );

  return result;
}
