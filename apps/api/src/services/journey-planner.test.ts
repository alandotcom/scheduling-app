import { beforeEach, describe, expect, mock, test } from "bun:test";
import { desc, eq } from "drizzle-orm";
import {
  journeyDeliveries,
  journeyRuns,
  journeyVersions,
} from "@scheduling/db/schema";
import type {
  JourneyTriggerFilterAst,
  LinearJourneyGraph,
} from "@scheduling/dto";
import {
  getTestDb,
  setTestOrgContext,
  type TestDatabase,
} from "../test-utils/index.js";
import { createOrg } from "../test-utils/factories.js";
import type { ServiceContext } from "./locations.js";
import { journeyService } from "./journeys.js";
import { processJourneyDomainEvent } from "./journey-planner.js";

const db: TestDatabase = getTestDb();

function createJourneyGraph(input?: {
  filter?: JourneyTriggerFilterAst;
  waitDuration?: string;
  waitUntil?: string;
  waitOffset?: string;
}): LinearJourneyGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Trigger",
            config: {
              triggerType: "DomainEvent",
              domain: "appointment",
              startEvents: ["appointment.scheduled"],
              restartEvents: ["appointment.rescheduled"],
              stopEvents: ["appointment.canceled"],
              ...(input?.filter ? { filter: input.filter } : {}),
            },
          },
        },
      },
      {
        key: "wait-node",
        attributes: {
          id: "wait-node",
          type: "action-node",
          position: { x: 0, y: 120 },
          data: {
            type: "action",
            label: "Wait",
            config: {
              actionType: "wait",
              ...(input?.waitDuration
                ? { waitDuration: input.waitDuration }
                : {}),
              ...(input?.waitUntil ? { waitUntil: input.waitUntil } : {}),
              ...(input?.waitOffset ? { waitOffset: input.waitOffset } : {}),
            },
          },
        },
      },
      {
        key: "send-node",
        attributes: {
          id: "send-node",
          type: "action-node",
          position: { x: 0, y: 240 },
          data: {
            type: "action",
            label: "Send",
            config: {
              actionType: "send-message",
              channel: "email",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "trigger-to-wait",
        source: "trigger-node",
        target: "wait-node",
        attributes: {
          id: "trigger-to-wait",
          source: "trigger-node",
          target: "wait-node",
        },
      },
      {
        key: "wait-to-send",
        source: "wait-node",
        target: "send-node",
        attributes: {
          id: "wait-to-send",
          source: "wait-node",
          target: "send-node",
        },
      },
    ],
  };
}

function createAppointmentPayload(input?: {
  appointmentId?: string;
  timezone?: string;
  previousTimezone?: string;
}) {
  const appointmentId =
    input?.appointmentId ?? "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d10";

  const payload = {
    appointmentId,
    calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
    appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
    clientId: null,
    startAt: "2026-03-10T14:00:00.000Z",
    endAt: "2026-03-10T15:00:00.000Z",
    timezone: input?.timezone ?? "America/New_York",
    status: "scheduled" as const,
    notes: null,
  };

  if (!input?.previousTimezone) {
    return payload;
  }

  return {
    ...payload,
    previous: {
      ...payload,
      timezone: input.previousTimezone,
    },
  };
}

describe("processJourneyDomainEvent", () => {
  let context: ServiceContext;

  beforeEach(async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Journey Planner Org",
    });

    context = {
      orgId: org.id,
      userId: user.id,
    };
  });

  test("plans deterministic run and delivery for matching appointment event", async () => {
    const created = await journeyService.create(
      {
        name: "Planner Journey",
        graph: createJourneyGraph({ waitDuration: "2h" }),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    const scheduleRequester = mock(async () => ({
      eventId: "evt-scheduled-1",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload(),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        scheduleRequester,
        now: new Date("2026-02-16T09:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [latestVersion] = await db
      .select({ id: journeyVersions.id })
      .from(journeyVersions)
      .orderBy(desc(journeyVersions.version))
      .limit(1);

    const runs = await db
      .select()
      .from(journeyRuns)
      .where(eq(journeyRuns.journeyVersionId, latestVersion!.id));

    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("planned");

    const deliveries = await db
      .select()
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runs[0]!.id));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe("planned");
    expect(deliveries[0]?.stepKey).toBe("send-node");
    expect(scheduleRequester).toHaveBeenCalledTimes(1);
  });

  test("cancels pending deliveries when reschedule no longer matches filter", async () => {
    const created = await journeyService.create(
      {
        name: "Filtered Planner Journey",
        graph: createJourneyGraph({
          waitDuration: "1h",
          filter: {
            logic: "and",
            groups: [
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.timezone",
                    operator: "equals",
                    value: "America/New_York",
                  },
                ],
              },
            ],
          },
        }),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    await processJourneyDomainEvent(
      {
        id: "evt-2",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d44",
          timezone: "America/New_York",
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        now: new Date("2026-02-16T09:00:00.000Z"),
      },
    );

    const cancelRequester = mock(async () => ({ eventId: "evt-canceled-1" }));

    await processJourneyDomainEvent(
      {
        id: "evt-3",
        orgId: context.orgId,
        type: "appointment.rescheduled",
        payload: createAppointmentPayload({
          appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d44",
          timezone: "UTC",
          previousTimezone: "America/New_York",
        }),
        timestamp: "2026-02-16T10:30:00.000Z",
      },
      {
        cancelRequester,
        now: new Date("2026-02-16T09:30:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const runs = await db.select().from(journeyRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("canceled");

    const deliveries = await db
      .select()
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runs[0]!.id));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe("canceled");
    expect(cancelRequester).toHaveBeenCalledTimes(1);
  });

  test("keeps run and delivery identities idempotent for duplicate events", async () => {
    const created = await journeyService.create(
      {
        name: "Idempotent Journey",
        graph: createJourneyGraph({ waitDuration: "90m" }),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    const payload = createAppointmentPayload({
      appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d55",
    });

    await processJourneyDomainEvent({
      id: "evt-4",
      orgId: context.orgId,
      type: "appointment.scheduled",
      payload,
      timestamp: "2026-02-16T10:00:00.000Z",
    });

    await processJourneyDomainEvent({
      id: "evt-4-duplicate",
      orgId: context.orgId,
      type: "appointment.scheduled",
      payload,
      timestamp: "2026-02-16T10:00:00.000Z",
    });

    await setTestOrgContext(db, context.orgId);

    const runs = await db.select().from(journeyRuns);
    expect(runs).toHaveLength(1);

    const deliveries = await db
      .select()
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runs[0]!.id));

    expect(deliveries).toHaveLength(1);
  });

  test("marks past-due deliveries as skipped with reasonCode=past_due", async () => {
    const created = await journeyService.create(
      {
        name: "Past Due Journey",
        graph: createJourneyGraph({
          waitUntil: "2020-01-01T00:00:00.000Z",
        }),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    const scheduleRequester = mock(async () => ({
      eventId: "evt-scheduled-2",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-5",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d66",
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        scheduleRequester,
      },
    );

    await setTestOrgContext(db, context.orgId);

    const runs = await db.select().from(journeyRuns);
    expect(runs).toHaveLength(1);

    const deliveries = await db
      .select()
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runs[0]!.id));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe("skipped");
    expect(deliveries[0]?.reasonCode).toBe("past_due");
    expect(scheduleRequester).toHaveBeenCalledTimes(0);
  });

  test("creates mode=test runs for test_only journeys", async () => {
    const created = await journeyService.create(
      {
        name: "Test Only Planner Journey",
        graph: createJourneyGraph({ waitDuration: "15m" }),
      },
      context,
    );

    await journeyService.publish(
      created.id,
      {
        mode: "test",
      },
      context,
    );

    await processJourneyDomainEvent({
      id: "evt-test-mode-1",
      orgId: context.orgId,
      type: "appointment.scheduled",
      payload: createAppointmentPayload({
        appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d77",
      }),
      timestamp: "2026-02-16T10:00:00.000Z",
    });

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id, mode: journeyRuns.mode })
      .from(journeyRuns)
      .limit(1);

    expect(run).toBeDefined();
    expect(run?.mode).toBe("test");
  });
});
