import { beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { journeyDeliveries, journeyRuns } from "@scheduling/db/schema";
import type { LinearJourneyGraph } from "@scheduling/dto";
import {
  getTestDb,
  registerDbTestReset,
  setTestOrgContext,
  type TestDatabase,
} from "../../test-utils/index.js";
import {
  createClient,
  createOrg,
  createQuickAppointment,
} from "../../test-utils/factories.js";
import type { ServiceContext } from "../locations.js";
import { clientCustomAttributeService } from "../client-custom-attributes.js";
import { journeyService } from "./journeys.js";
import { processJourneyDomainEvent as processJourneyDomainEventBase } from "./journey-planner.js";

registerDbTestReset("per-file");

const db: TestDatabase = getTestDb();
const defaultRunStartRequester = mock(
  async (): Promise<{ eventId?: string }> => ({}),
);

beforeEach(() => {
  defaultRunStartRequester.mockReset();
  defaultRunStartRequester.mockResolvedValue({});
});

function processJourneyDomainEvent(
  ...args: Parameters<typeof processJourneyDomainEventBase>
) {
  const [event, dependencies] = args;
  return processJourneyDomainEventBase(event, {
    ...dependencies,
    runStartRequester:
      dependencies?.runStartRequester ?? defaultRunStartRequester,
  });
}

// ---------------------------------------------------------------------------
// Graph + payload builders

function createAppointmentJourneyGraph(input?: {
  withCanceledBranch?: boolean;
}): LinearJourneyGraph {
  const nodes: LinearJourneyGraph["nodes"] = [
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
            triggerType: "AppointmentJourney",
            start: "appointment.scheduled",
            restart: "appointment.rescheduled",
            stop: "appointment.canceled",
            correlationKey: "appointmentId",
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
          config: { actionType: "wait", waitDuration: "2h" },
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
          label: "Reminder",
          config: { actionType: "send-resend" },
        },
      },
    },
  ];
  const edges: LinearJourneyGraph["edges"] = [
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
  ];

  if (input?.withCanceledBranch) {
    nodes.push({
      key: "send-cancel-node",
      attributes: {
        id: "send-cancel-node",
        type: "action-node",
        position: { x: 200, y: 120 },
        data: {
          type: "action",
          label: "Cancellation Notice",
          config: { actionType: "send-resend" },
        },
      },
    });
    edges[0] = {
      key: "trigger-to-wait",
      source: "trigger-node",
      target: "wait-node",
      attributes: {
        id: "trigger-to-wait",
        source: "trigger-node",
        target: "wait-node",
        data: { triggerBranch: "scheduled" },
      },
    };
    edges.push({
      key: "trigger-to-cancel",
      source: "trigger-node",
      target: "send-cancel-node",
      attributes: {
        id: "trigger-to-cancel",
        source: "trigger-node",
        target: "send-cancel-node",
        data: { triggerBranch: "canceled" },
      },
    });
  }

  return { attributes: {}, options: { type: "directed" }, nodes, edges };
}

function createClientJourneyGraph(input: {
  event: "client.created" | "client.updated";
  trackedAttributeKey?: string;
}): LinearJourneyGraph {
  return {
    attributes: {},
    options: { type: "directed" },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Client Trigger",
            config: {
              triggerType: "ClientJourney",
              event: input.event,
              correlationKey: "clientId",
              ...(input.event === "client.updated"
                ? {
                    trackedAttributeKey:
                      input.trackedAttributeKey ?? "membershipTier",
                  }
                : {}),
            },
          },
        },
      },
      {
        key: "send-node",
        attributes: {
          id: "send-node",
          type: "action-node",
          position: { x: 0, y: 140 },
          data: {
            type: "action",
            label: "Welcome",
            config: { actionType: "send-resend" },
          },
        },
      },
    ],
    edges: [
      {
        key: "trigger-to-send",
        source: "trigger-node",
        target: "send-node",
        attributes: {
          id: "trigger-to-send",
          source: "trigger-node",
          target: "send-node",
        },
      },
    ],
  };
}

function createAppointmentPayload(input: {
  appointmentId: string;
  status?: "scheduled" | "confirmed" | "cancelled" | "no_show";
}) {
  const clientId = "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13";
  return {
    appointmentId: input.appointmentId,
    calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
    appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
    clientId,
    startAt: "2026-03-10T14:00:00.000Z",
    endAt: "2026-03-10T15:00:00.000Z",
    timezone: "America/New_York",
    status: input.status ?? ("scheduled" as const),
    calendarRequiresConfirmation: false,
    notes: null,
    appointment: {
      id: input.appointmentId,
      calendarId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
      appointmentTypeId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
      clientId,
      startAt: "2026-03-10T14:00:00.000Z",
      endAt: "2026-03-10T15:00:00.000Z",
      timezone: "America/New_York",
      status: input.status ?? ("scheduled" as const),
      calendarRequiresConfirmation: false,
      notes: null,
    },
    client: {
      id: clientId,
      firstName: "Ada",
      lastName: "Lovelace",
      email: null,
      phone: null,
      customAttributes: {},
    },
  };
}

function createClientCreatedPayload(clientId: string) {
  return {
    clientId,
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    phone: null,
    customAttributes: {},
  };
}

function createClientUpdatedPayload(input: {
  clientId: string;
  trackedAttributeKey?: string;
}) {
  const trackedAttributeKey = input.trackedAttributeKey ?? "membershipTier";
  return {
    clientId: input.clientId,
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    phone: null,
    customAttributes: { [trackedAttributeKey]: "gold" },
    previous: {
      clientId: input.clientId,
      firstName: "Avery",
      lastName: "Stone",
      email: "avery@example.com",
      phone: null,
      customAttributes: { [trackedAttributeKey]: "silver" },
    },
  };
}

async function publishJourney(
  context: ServiceContext,
  name: string,
  graph: LinearJourneyGraph,
): Promise<string> {
  const created = await journeyService.create({ name, graph }, context);
  await journeyService.publish(created.id, { mode: "live" }, context);
  return created.id;
}

async function readRuns(orgId: string, appointmentId: string) {
  await setTestOrgContext(db, orgId);
  return db
    .select({
      id: journeyRuns.id,
      status: journeyRuns.status,
      mode: journeyRuns.mode,
    })
    .from(journeyRuns)
    .where(eq(journeyRuns.appointmentId, appointmentId));
}

// ---------------------------------------------------------------------------

describe("processJourneyDomainEvent (Inngest dispatcher)", () => {
  let context: ServiceContext;

  beforeEach(async () => {
    const { org, user } = await createOrg(db as any, {
      name: "Journey Planner Org",
    });
    context = { orgId: org.id, userId: user.id };
  });

  test("appointment.scheduled creates one run and emits a run-start event", async () => {
    const journeyId = await publishJourney(
      context,
      "Reminder",
      createAppointmentJourneyGraph(),
    );
    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );
    const runStartRequester = mock(async () => ({ eventId: "evt-1" }));

    const result = await processJourneyDomainEvent(
      {
        id: "evt-scheduled-1",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      { runStartRequester, now: new Date("2026-02-16T10:00:00.000Z") },
    );

    expect(result.plannedRunIds).toHaveLength(1);
    expect(runStartRequester).toHaveBeenCalledTimes(1);

    const runs = await readRuns(context.orgId, appointmentId);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("planned");

    expect(runStartRequester).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyRunId: runs[0]!.id,
        journeyId,
        triggerEntityType: "appointment",
        triggerEntityId: appointmentId,
        appointmentId,
        triggerBranch: "scheduled",
        mode: "live",
      }),
    );

    const deliveries = await db
      .select({ id: journeyDeliveries.id })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, runs[0]!.id));
    expect(deliveries).toHaveLength(0);
  });

  test("a duplicate appointment.scheduled is idempotent", async () => {
    await publishJourney(context, "Reminder", createAppointmentJourneyGraph());
    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );
    const runStartRequester = mock(async () => ({ eventId: "evt" }));
    const event = {
      id: "evt-scheduled-dup",
      orgId: context.orgId,
      type: "appointment.scheduled" as const,
      payload: createAppointmentPayload({ appointmentId }),
      timestamp: "2026-02-16T10:00:00.000Z",
    };

    await processJourneyDomainEvent(event, { runStartRequester });
    const second = await processJourneyDomainEvent(event, {
      runStartRequester,
    });

    expect(second.plannedRunIds).toHaveLength(0);
    expect(runStartRequester).toHaveBeenCalledTimes(1);
    const runs = await readRuns(context.orgId, appointmentId);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("planned");
  });

  test("appointment.canceled cancels the active run when there is no terminal branch", async () => {
    await publishJourney(context, "Reminder", createAppointmentJourneyGraph());
    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    await processJourneyDomainEvent({
      id: "evt-scheduled",
      orgId: context.orgId,
      type: "appointment.scheduled",
      payload: createAppointmentPayload({ appointmentId }),
      timestamp: "2026-02-16T10:00:00.000Z",
    });

    const result = await processJourneyDomainEvent({
      id: "evt-canceled",
      orgId: context.orgId,
      type: "appointment.canceled",
      payload: createAppointmentPayload({ appointmentId, status: "cancelled" }),
      timestamp: "2026-02-16T11:00:00.000Z",
    });

    expect(result.plannedRunIds).toHaveLength(0);
    const runs = await readRuns(context.orgId, appointmentId);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("canceled");
  });

  test("appointment.canceled starts the terminal branch when present", async () => {
    await publishJourney(
      context,
      "Reminder With Cancel Branch",
      createAppointmentJourneyGraph({ withCanceledBranch: true }),
    );
    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );

    await processJourneyDomainEvent({
      id: "evt-scheduled",
      orgId: context.orgId,
      type: "appointment.scheduled",
      payload: createAppointmentPayload({ appointmentId }),
      timestamp: "2026-02-16T10:00:00.000Z",
    });

    const runStartRequester = mock(async () => ({ eventId: "evt" }));
    const result = await processJourneyDomainEvent(
      {
        id: "evt-canceled",
        orgId: context.orgId,
        type: "appointment.canceled",
        payload: createAppointmentPayload({
          appointmentId,
          status: "cancelled",
        }),
        timestamp: "2026-02-16T11:00:00.000Z",
      },
      { runStartRequester },
    );

    expect(result.plannedRunIds).toHaveLength(1);
    expect(runStartRequester).toHaveBeenCalledWith(
      expect.objectContaining({ triggerBranch: "canceled" }),
    );

    const runs = await readRuns(context.orgId, appointmentId);
    expect(runs).toHaveLength(2);
    expect(runs.filter((r) => r.status === "canceled")).toHaveLength(1);
    expect(runs.filter((r) => r.status === "planned")).toHaveLength(1);
  });

  test("appointment.rescheduled cancels the in-flight run and starts a fresh one", async () => {
    await publishJourney(context, "Reminder", createAppointmentJourneyGraph());
    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );
    const runStartRequester = mock(async () => ({ eventId: "evt" }));

    await processJourneyDomainEvent(
      {
        id: "evt-scheduled",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      { runStartRequester },
    );

    const result = await processJourneyDomainEvent(
      {
        id: "evt-rescheduled",
        orgId: context.orgId,
        type: "appointment.rescheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T11:00:00.000Z",
      },
      { runStartRequester },
    );

    expect(result.plannedRunIds).toHaveLength(1);
    expect(runStartRequester).toHaveBeenCalledTimes(2);

    const runs = await readRuns(context.orgId, appointmentId);
    expect(runs).toHaveLength(2);
    expect(runs.filter((r) => r.status === "canceled")).toHaveLength(1);
    expect(runs.filter((r) => r.status === "planned")).toHaveLength(1);
  });

  test("appointment.confirmed is ignored by the dispatcher (waitForEvent handles it)", async () => {
    await publishJourney(context, "Reminder", createAppointmentJourneyGraph());
    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );
    const runStartRequester = mock(async () => ({ eventId: "evt" }));

    await processJourneyDomainEvent(
      {
        id: "evt-scheduled",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      { runStartRequester },
    );

    const result = await processJourneyDomainEvent(
      {
        id: "evt-confirmed",
        orgId: context.orgId,
        type: "appointment.confirmed",
        payload: createAppointmentPayload({
          appointmentId,
          status: "confirmed",
        }),
        timestamp: "2026-02-16T10:30:00.000Z",
      },
      { runStartRequester },
    );

    expect(result.plannedRunIds).toHaveLength(0);
    expect(result.ignoredJourneyIds).toHaveLength(1);
    expect(runStartRequester).toHaveBeenCalledTimes(1);
    const runs = await readRuns(context.orgId, appointmentId);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("planned");
  });

  test("client.created creates a run", async () => {
    await publishJourney(
      context,
      "Welcome",
      createClientJourneyGraph({ event: "client.created" }),
    );
    const client = await createClient(db as any, context.orgId);
    const runStartRequester = mock(async () => ({ eventId: "evt" }));

    const result = await processJourneyDomainEvent(
      {
        id: "evt-client-created",
        orgId: context.orgId,
        type: "client.created",
        payload: createClientCreatedPayload(client.id),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      { runStartRequester },
    );

    expect(result.plannedRunIds).toHaveLength(1);
    expect(runStartRequester).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerEntityType: "client",
        triggerEntityId: client.id,
        clientId: client.id,
      }),
    );
  });

  test("client.updated errors when the tracked attribute no longer exists", async () => {
    const definition = await clientCustomAttributeService.createDefinition(
      {
        fieldKey: "membershipTier",
        label: "Membership Tier",
        type: "TEXT",
        required: false,
        displayOrder: 0,
      },
      context,
    );
    const journeyId = await publishJourney(
      context,
      "Tier Change",
      createClientJourneyGraph({
        event: "client.updated",
        trackedAttributeKey: "membershipTier",
      }),
    );
    const client = await createClient(db as any, context.orgId);
    await clientCustomAttributeService.deleteDefinition(definition.id, context);

    const result = await processJourneyDomainEvent({
      id: "evt-client-updated",
      orgId: context.orgId,
      type: "client.updated",
      payload: createClientUpdatedPayload({
        clientId: client.id,
        trackedAttributeKey: "membershipTier",
      }),
      timestamp: "2026-02-16T10:00:00.000Z",
    });

    expect(result.plannedRunIds).toHaveLength(0);
    expect(result.erroredJourneyIds).toContain(journeyId);
  });

  test("a scoped test run creates a test-mode run", async () => {
    const journeyId = await publishJourney(
      context,
      "Reminder",
      createAppointmentJourneyGraph(),
    );
    const appointmentId = await createQuickAppointment(
      db as any,
      context.orgId,
    );
    const runStartRequester = mock(async () => ({ eventId: "evt" }));

    const result = await processJourneyDomainEvent(
      {
        id: "evt-test-run",
        orgId: context.orgId,
        type: "appointment.scheduled",
        payload: createAppointmentPayload({ appointmentId }),
        timestamp: "2026-02-16T10:00:00.000Z",
      },
      {
        runStartRequester,
        journeyIds: [journeyId],
        modeOverride: "test",
      },
    );

    expect(result.plannedRunIds).toHaveLength(1);
    const runs = await readRuns(context.orgId, appointmentId);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.mode).toBe("test");
  });
});
