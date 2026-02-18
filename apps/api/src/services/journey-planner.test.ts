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

function createTriggerConfig(input?: { filter?: JourneyTriggerFilterAst }) {
  return {
    triggerType: "AppointmentJourney",
    start: "appointment.scheduled",
    restart: "appointment.rescheduled",
    stop: "appointment.canceled",
    correlationKey: "appointmentId",
    ...(input?.filter ? { filter: input.filter } : {}),
  } as const;
}

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
            config: createTriggerConfig(
              input?.filter ? { filter: input.filter } : undefined,
            ),
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
              actionType: "send-resend",
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

function createLoggerJourneyGraph(input?: {
  waitDuration?: string;
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
            config: createTriggerConfig(),
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
              waitDuration: input?.waitDuration ?? "10m",
            },
          },
        },
      },
      {
        key: "logger-node",
        attributes: {
          id: "logger-node",
          type: "action-node",
          position: { x: 0, y: 240 },
          data: {
            type: "action",
            label: "Logger",
            config: {
              actionType: "logger",
              message: "Timeline marker",
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
        key: "wait-to-logger",
        source: "wait-node",
        target: "logger-node",
        attributes: {
          id: "wait-to-logger",
          source: "wait-node",
          target: "logger-node",
        },
      },
    ],
  };
}

function createResendTemplateJourneyGraph(input?: {
  waitDuration?: string;
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
            config: createTriggerConfig(),
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
              waitDuration: input?.waitDuration ?? "15m",
            },
          },
        },
      },
      {
        key: "send-template-node",
        attributes: {
          id: "send-template-node",
          type: "action-node",
          position: { x: 0, y: 240 },
          data: {
            type: "action",
            label: "Send Template",
            config: {
              actionType: "send-resend-template",
              templateIdOrAlias: "appointment-reminder",
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
        key: "wait-to-send-template",
        source: "wait-node",
        target: "send-template-node",
        attributes: {
          id: "wait-to-send-template",
          source: "wait-node",
          target: "send-template-node",
        },
      },
    ],
  };
}

function createConditionJourneyGraph(input?: {
  expression?: string;
  includeTrueEdge?: boolean;
  includeFalseEdge?: boolean;
}): LinearJourneyGraph {
  const includeTrueEdge = input?.includeTrueEdge ?? true;
  const includeFalseEdge = input?.includeFalseEdge ?? true;

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
            config: createTriggerConfig(),
          },
        },
      },
      {
        key: "condition-node",
        attributes: {
          id: "condition-node",
          type: "action-node",
          position: { x: 0, y: 120 },
          data: {
            type: "action",
            label: "Condition",
            config: {
              actionType: "condition",
              expression: input?.expression ?? "true",
            },
          },
        },
      },
      ...(includeTrueEdge
        ? [
            {
              key: "send-true-node",
              attributes: {
                id: "send-true-node",
                type: "action-node",
                position: { x: -160, y: 240 },
                data: {
                  type: "action" as const,
                  label: "Send True",
                  config: {
                    actionType: "send-resend",
                  },
                },
              },
            },
          ]
        : []),
      ...(includeFalseEdge
        ? [
            {
              key: "send-false-node",
              attributes: {
                id: "send-false-node",
                type: "action-node",
                position: { x: 160, y: 240 },
                data: {
                  type: "action" as const,
                  label: "Send False",
                  config: {
                    actionType: "send-slack",
                  },
                },
              },
            },
          ]
        : []),
    ],
    edges: [
      {
        key: "trigger-to-condition",
        source: "trigger-node",
        target: "condition-node",
        attributes: {
          id: "trigger-to-condition",
          source: "trigger-node",
          target: "condition-node",
        },
      },
      ...(includeTrueEdge
        ? [
            {
              key: "condition-to-send-true",
              source: "condition-node",
              target: "send-true-node",
              attributes: {
                id: "condition-to-send-true",
                source: "condition-node",
                target: "send-true-node",
                label: "True",
                data: { conditionBranch: "true" },
              },
            },
          ]
        : []),
      ...(includeFalseEdge
        ? [
            {
              key: "condition-to-send-false",
              source: "condition-node",
              target: "send-false-node",
              attributes: {
                id: "condition-to-send-false",
                source: "condition-node",
                target: "send-false-node",
                label: "False",
                data: { conditionBranch: "false" },
              },
            },
          ]
        : []),
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
    appointment: {
      id: appointmentId,
      calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
      appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
      clientId: null,
      startAt: "2026-03-10T14:00:00.000Z",
      endAt: "2026-03-10T15:00:00.000Z",
      timezone: input?.timezone ?? "America/New_York",
      status: "scheduled" as const,
      notes: null,
    },
    client: null,
  };

  if (!input?.previousTimezone) {
    return payload;
  }

  return {
    ...payload,
    previous: {
      ...payload,
      timezone: input.previousTimezone,
      appointment: {
        ...payload.appointment,
        timezone: input.previousTimezone,
      },
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

    const scheduleResendRequester = mock(async () => ({
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
        scheduleResendRequester,
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
    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
  });

  test("plans logger action deliveries with logger channel", async () => {
    const created = await journeyService.create(
      {
        name: "Logger Planner Journey",
        graph: createLoggerJourneyGraph(),
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

    const scheduleLoggerRequester = mock(async () => ({
      eventId: "evt-scheduled-logger",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-logger-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d21",
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        scheduleLoggerRequester,
        now: new Date("2026-02-16T09:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const deliveries = await db
      .select({
        stepKey: journeyDeliveries.stepKey,
        channel: journeyDeliveries.channel,
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.stepKey).toBe("logger-node");
    expect(deliveries[0]?.channel).toBe("logger");
    expect(deliveries[0]?.status).toBe("planned");
    expect(scheduleLoggerRequester).toHaveBeenCalledTimes(1);
  });

  test("hard-cuts integration actions to provider-specific schedulers", async () => {
    const [resendJourney, slackJourney] = await Promise.all([
      journeyService.create(
        {
          name: "Resend Scheduler Journey",
          graph: createJourneyGraph({ waitDuration: "5m" }),
        },
        context,
      ),
      journeyService.create(
        {
          name: "Slack Scheduler Journey",
          graph: createConditionJourneyGraph({
            expression: "false",
          }),
        },
        context,
      ),
    ]);

    await Promise.all([
      journeyService.publish(resendJourney.id, { mode: "live" }, context),
      journeyService.publish(slackJourney.id, { mode: "live" }, context),
    ]);

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-scheduled-resend",
    }));
    const scheduleSlackRequester = mock(async () => ({
      eventId: "evt-scheduled-slack",
    }));
    const scheduleLoggerRequester = mock(async () => ({
      eventId: "evt-scheduled-logger",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-provider-scheduler-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57daf",
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        scheduleResendRequester,
        scheduleSlackRequester,
        scheduleLoggerRequester,
        now: new Date("2026-02-16T09:00:00.000Z"),
      },
    );

    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
    expect(scheduleSlackRequester).toHaveBeenCalledTimes(1);
    expect(scheduleLoggerRequester).toHaveBeenCalledTimes(0);
  });

  test("routes send-resend-template through the resend-specific scheduler", async () => {
    const created = await journeyService.create(
      {
        name: "Resend Template Scheduler Journey",
        graph: createResendTemplateJourneyGraph(),
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

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-scheduled-resend-template",
    }));
    const scheduleSlackRequester = mock(async () => ({
      eventId: "evt-scheduled-slack-template",
    }));
    const scheduleLoggerRequester = mock(async () => ({
      eventId: "evt-scheduled-logger-template",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-resend-template-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57db0",
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        scheduleResendRequester,
        scheduleSlackRequester,
        scheduleLoggerRequester,
        now: new Date("2026-02-16T09:00:00.000Z"),
      },
    );

    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
    expect(scheduleSlackRequester).toHaveBeenCalledTimes(0);
    expect(scheduleLoggerRequester).toHaveBeenCalledTimes(0);
  });

  test("routes through the matching condition branch during planning", async () => {
    const created = await journeyService.create(
      {
        name: "Condition Branch Journey",
        graph: createConditionJourneyGraph({
          expression: 'appointment.timezone == "America/New_York"',
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

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-scheduled-condition-branch",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-condition-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d31",
          timezone: "America/New_York",
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        scheduleResendRequester,
        now: new Date("2026-02-16T09:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const deliveries = await db
      .select({
        stepKey: journeyDeliveries.stepKey,
        channel: journeyDeliveries.channel,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.stepKey).toBe("send-true-node");
    expect(deliveries[0]?.channel).toBe("email");
    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
  });

  test("does not schedule downstream deliveries when condition is false and false edge is missing", async () => {
    const created = await journeyService.create(
      {
        name: "Condition Missing Branch Journey",
        graph: createConditionJourneyGraph({
          expression: "false",
          includeFalseEdge: false,
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

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-scheduled-condition-missing",
    }));

    const result = await processJourneyDomainEvent(
      {
        id: "evt-condition-2",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d32",
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        scheduleResendRequester,
        now: new Date("2026-02-16T09:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({
        id: journeyRuns.id,
        status: journeyRuns.status,
      })
      .from(journeyRuns)
      .orderBy(desc(journeyRuns.id))
      .limit(1);

    const deliveries = await db
      .select({
        id: journeyDeliveries.id,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id));

    expect(result.erroredJourneyIds).toHaveLength(0);
    expect(run?.status).toBe("planned");
    expect(deliveries).toHaveLength(0);
    expect(scheduleResendRequester).toHaveBeenCalledTimes(0);
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

  test("creates independent run and delivery sets when two journeys match the same appointment", async () => {
    const [firstJourney, secondJourney] = await Promise.all([
      journeyService.create(
        {
          name: "Multi Journey A",
          graph: createJourneyGraph({ waitDuration: "30m" }),
        },
        context,
      ),
      journeyService.create(
        {
          name: "Multi Journey B",
          graph: createJourneyGraph({ waitDuration: "30m" }),
        },
        context,
      ),
    ]);

    await Promise.all([
      journeyService.publish(firstJourney.id, { mode: "live" }, context),
      journeyService.publish(secondJourney.id, { mode: "live" }, context),
    ]);

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-multi-journey",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-multi-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d88",
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        scheduleResendRequester,
        now: new Date("2026-02-16T09:00:00.000Z"),
      },
    );

    await processJourneyDomainEvent(
      {
        id: "evt-multi-1-duplicate",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d88",
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        scheduleResendRequester,
        now: new Date("2026-02-16T09:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const runs = await db.select({ id: journeyRuns.id }).from(journeyRuns);
    expect(runs).toHaveLength(2);

    const deliveries = await db
      .select({
        id: journeyDeliveries.id,
        deterministicKey: journeyDeliveries.deterministicKey,
      })
      .from(journeyDeliveries)
      .orderBy(desc(journeyDeliveries.id));

    expect(deliveries).toHaveLength(2);
    expect(
      new Set(deliveries.map((delivery) => delivery.deterministicKey)).size,
    ).toBe(2);
    expect(scheduleResendRequester).toHaveBeenCalledTimes(2);
  });

  test("treats due-now deliveries as planned instead of past_due", async () => {
    const created = await journeyService.create(
      {
        name: "Due Now Journey",
        graph: createJourneyGraph({
          waitUntil: "2026-02-16T09:00:00.000Z",
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

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-due-now",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-due-now-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d99",
        }),
        timestamp: "2026-02-16T09:00:00.000Z",
      },
      {
        scheduleResendRequester,
        now: new Date("2026-02-16T09:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .limit(1);

    const [delivery] = await db
      .select({
        status: journeyDeliveries.status,
        reasonCode: journeyDeliveries.reasonCode,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, run!.id))
      .limit(1);

    expect(delivery?.status).toBe("planned");
    expect(delivery?.reasonCode).toBeNull();
    expect(scheduleResendRequester).toHaveBeenCalledTimes(1);
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

    const scheduleResendRequester = mock(async () => ({
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
        scheduleResendRequester,
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
    expect(scheduleResendRequester).toHaveBeenCalledTimes(0);
  });

  test("creates mode=test runs for published journeys in test mode", async () => {
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

  test("keeps test-mode wait scheduling identical to live mode", async () => {
    const liveJourney = await journeyService.create(
      {
        name: "Wait Invariance Live Journey",
        graph: createJourneyGraph({ waitDuration: "45m" }),
      },
      context,
    );

    await journeyService.publish(
      liveJourney.id,
      {
        mode: "live",
      },
      context,
    );

    const testOnlyJourney = await journeyService.create(
      {
        name: "Wait Invariance Test Journey",
        graph: createJourneyGraph({ waitDuration: "45m" }),
      },
      context,
    );

    await journeyService.publish(
      testOnlyJourney.id,
      {
        mode: "test",
      },
      context,
    );

    const scheduleResendRequester = mock(async () => ({
      eventId: "evt-test-wait-invariance",
    }));

    await processJourneyDomainEvent(
      {
        id: "evt-test-wait-invariance",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({
          appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d88",
        }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        scheduleResendRequester,
        now: new Date("2026-02-16T10:00:00.000Z"),
      },
    );

    await setTestOrgContext(db, context.orgId);

    const runs = await db
      .select({ id: journeyRuns.id, mode: journeyRuns.mode })
      .from(journeyRuns);

    const runByMode = new Map(runs.map((run) => [run.mode, run.id]));
    expect(runByMode.size).toBe(2);

    const [liveDelivery] = await db
      .select({ scheduledFor: journeyDeliveries.scheduledFor })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runByMode.get("live")!))
      .limit(1);

    const [testDelivery] = await db
      .select({ scheduledFor: journeyDeliveries.scheduledFor })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runByMode.get("test")!))
      .limit(1);

    expect(liveDelivery).toBeDefined();
    expect(testDelivery).toBeDefined();
    expect(testDelivery?.scheduledFor.toISOString()).toBe(
      liveDelivery?.scheduledFor.toISOString(),
    );
  });
});
