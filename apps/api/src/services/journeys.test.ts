import { beforeEach, describe, expect, test } from "bun:test";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  journeyDeliveries,
  journeyRuns,
  journeys,
  journeyVersions,
} from "@scheduling/db/schema";
import {
  getTestDb,
  setTestOrgContext,
  type TestDatabase,
} from "../test-utils/index.js";
import {
  createAppointment,
  createAppointmentType,
  createCalendar,
  createLocation,
  createOrg,
} from "../test-utils/factories.js";
import { journeyService } from "./journeys.js";
import type { ServiceContext } from "./locations.js";
import type { LinearJourneyGraph } from "@scheduling/dto";

function createTriggerConfig() {
  return {
    triggerType: "AppointmentJourney",
    start: "appointment.scheduled",
    restart: "appointment.rescheduled",
    stop: "appointment.canceled",
    correlationKey: "appointmentId",
  } as const;
}

function createLinearGraph(triggerId = "trigger-1"): LinearJourneyGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: triggerId,
        attributes: {
          id: triggerId,
          type: "trigger-node",
          position: {
            x: 0,
            y: 0,
          },
          data: {
            label: "Trigger",
            type: "trigger",
            config: createTriggerConfig(),
          },
        },
      },
    ],
    edges: [],
  };
}

function createLinearGraphWithSendMessage(input?: {
  triggerId?: string;
  channel?: "email" | "email-template" | "slack";
}): LinearJourneyGraph {
  const triggerId = input?.triggerId ?? "trigger-with-send";
  const channel = input?.channel ?? "email";
  const actionType =
    channel === "slack"
      ? "send-slack"
      : channel === "email-template"
        ? "send-resend-template"
        : "send-resend";

  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: triggerId,
        attributes: {
          id: triggerId,
          type: "trigger-node",
          position: {
            x: 0,
            y: 0,
          },
          data: {
            label: "Trigger",
            type: "trigger",
            config: createTriggerConfig(),
          },
        },
      },
      {
        key: "send-step",
        attributes: {
          id: "send-step",
          type: "action-node",
          position: {
            x: 0,
            y: 120,
          },
          data: {
            label: "Send Message",
            type: "action",
            config: {
              actionType,
            },
          },
        },
      },
    ],
    edges: [
      {
        key: `${triggerId}-to-send-step`,
        source: triggerId,
        target: "send-step",
        attributes: {
          id: `${triggerId}-to-send-step`,
          source: triggerId,
          target: "send-step",
        },
      },
    ],
  };
}

function createLinearGraphWithTriggerConfig(input: {
  triggerId: string;
  filter?: {
    logic: "and" | "or";
    groups: Array<{
      logic: "and" | "or";
      conditions: Array<{
        field: string;
        operator: "equals";
        value: string;
      }>;
    }>;
  };
}): LinearJourneyGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: input.triggerId,
        attributes: {
          id: input.triggerId,
          type: "trigger-node",
          position: {
            x: 0,
            y: 0,
          },
          data: {
            label: "Trigger",
            type: "trigger",
            config: {
              ...createTriggerConfig(),
              ...(input.filter ? { filter: input.filter } : {}),
            },
          },
        },
      },
    ],
    edges: [],
  };
}

describe("JourneyService", () => {
  const db: TestDatabase = getTestDb();
  let context: ServiceContext;
  let otherContext: ServiceContext;

  beforeEach(async () => {
    const primary = await createOrg(db as any, { name: "Journey Primary Org" });
    context = { orgId: primary.org.id, userId: primary.user.id };

    const secondary = await createOrg(db as any, {
      name: "Journey Secondary Org",
      email: "journey-secondary@example.com",
    });
    otherContext = { orgId: secondary.org.id, userId: secondary.user.id };
  });

  test("supports publish -> pause -> resume lifecycle transitions with invalid transition guards", async () => {
    const created = await journeyService.create(
      {
        name: "Lifecycle Journey",
        graph: createLinearGraph("trigger-lifecycle"),
      },
      context,
    );

    expect(created.status).toBe("draft");
    expect(created.mode).toBe("live");

    const updated = await journeyService.update(
      created.id,
      {
        name: "Lifecycle Journey Updated",
        graph: createLinearGraph("trigger-lifecycle-updated"),
      },
      context,
    );
    expect(updated.name).toBe("Lifecycle Journey Updated");

    const updatedDraftMode = await journeyService.update(
      created.id,
      {
        mode: "test",
      },
      context,
    );
    expect(updatedDraftMode.status).toBe("draft");
    expect(updatedDraftMode.mode).toBe("test");

    await expect(
      journeyService.pause(created.id, context),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const firstPublish = await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    expect(firstPublish.journey.status).toBe("published");
    expect(firstPublish.journey.mode).toBe("live");
    expect(firstPublish.version).toBe(1);

    await expect(
      journeyService.update(
        created.id,
        {
          mode: "test",
        },
        context,
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const paused = await journeyService.pause(created.id, context);
    expect(paused.status).toBe("paused");
    expect(paused.mode).toBe("live");

    await expect(
      journeyService.publish(
        created.id,
        {
          mode: "live",
        },
        context,
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const resumed = await journeyService.resume(created.id, context);
    expect(resumed.status).toBe("published");
    expect(resumed.mode).toBe("live");

    const switchedMode = await journeyService.setMode(
      created.id,
      {
        mode: "test",
      },
      context,
    );
    expect(switchedMode.status).toBe("published");
    expect(switchedMode.mode).toBe("test");
  });

  test("graph updates on published journeys create a new live version for subsequent runs", async () => {
    const location = await createLocation(db as any, context.orgId);
    const calendar = await createCalendar(db as any, context.orgId, {
      locationId: location.id,
    });
    const appointmentType = await createAppointmentType(
      db as any,
      context.orgId,
      {
        calendarIds: [calendar.id],
      },
    );
    const appointment = await createAppointment(db as any, context.orgId, {
      calendarId: calendar.id,
      appointmentTypeId: appointmentType.id,
      startAt: new Date("2026-03-10T14:00:00.000Z"),
      endAt: new Date("2026-03-10T15:00:00.000Z"),
    });

    const created = await journeyService.create(
      {
        name: "Published Update Versioning Journey",
        graph: createLinearGraph("trigger-published-update"),
      },
      context,
    );

    const firstPublish = await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    expect(firstPublish.version).toBe(1);

    const updated = await journeyService.update(
      created.id,
      {
        graph: createLinearGraphWithSendMessage({
          triggerId: "trigger-published-update",
        }),
      },
      context,
    );

    expect(updated.status).toBe("published");

    await setTestOrgContext(db, context.orgId);

    const versionRows = await db
      .select({
        version: journeyVersions.version,
      })
      .from(journeyVersions)
      .where(eq(journeyVersions.journeyId, created.id))
      .orderBy(asc(journeyVersions.version));

    expect(versionRows.map((row) => row.version)).toEqual([1, 2]);

    const testRun = await journeyService.startTestRun(
      created.id,
      {
        appointmentId: appointment.id,
      },
      context,
    );

    const runDetail = await journeyService.getRun(testRun.runId, context);

    expect(runDetail.run.journeyVersion).toBe(2);
    expect(runDetail.deliveries).toHaveLength(1);
    expect(runDetail.events).toBeArray();
    expect(runDetail.stepLogs).toBeArray();
    expect(runDetail.triggerContext?.eventType).toBe("appointment.scheduled");
    expect(runDetail.triggerContext?.appointment?.id).toBe(appointment.id);
  });

  test("enforces org-scoped case-insensitive journey name uniqueness", async () => {
    await journeyService.create(
      {
        name: "Follow Up Journey",
        graph: createLinearGraph("trigger-uniqueness-a"),
      },
      context,
    );

    await expect(
      journeyService.create(
        {
          name: "follow up journey",
          graph: createLinearGraph("trigger-uniqueness-b"),
        },
        context,
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      details: { field: "name" },
    });

    await expect(
      journeyService.create(
        {
          name: "FOLLOW UP JOURNEY",
          graph: createLinearGraph("trigger-uniqueness-c"),
        },
        otherContext,
      ),
    ).resolves.toMatchObject({
      status: "draft",
      mode: "live",
    });
  });

  test("individual run cancel and journey bulk cancel enforce run scope", async () => {
    const primaryJourney = await journeyService.create(
      {
        name: "Cancel Scope Journey",
        graph: createLinearGraph("trigger-cancel-scope-primary"),
      },
      context,
    );

    const secondaryJourney = await journeyService.create(
      {
        name: "Cancel Scope Journey Secondary",
        graph: createLinearGraph("trigger-cancel-scope-secondary"),
      },
      context,
    );

    const publishedPrimary = await journeyService.publish(
      primaryJourney.id,
      {
        mode: "live",
      },
      context,
    );

    const publishedSecondary = await journeyService.publish(
      secondaryJourney.id,
      {
        mode: "live",
      },
      context,
    );

    await setTestOrgContext(db, context.orgId);

    const [primaryVersion] = await db
      .select({ id: journeyVersions.id })
      .from(journeyVersions)
      .where(
        and(
          eq(journeyVersions.journeyId, primaryJourney.id),
          eq(journeyVersions.version, publishedPrimary.version),
        ),
      )
      .limit(1);

    const [secondaryVersion] = await db
      .select({ id: journeyVersions.id })
      .from(journeyVersions)
      .where(
        and(
          eq(journeyVersions.journeyId, secondaryJourney.id),
          eq(journeyVersions.version, publishedSecondary.version),
        ),
      )
      .limit(1);

    const [targetRun] = await db
      .insert(journeyRuns)
      .values({
        orgId: context.orgId,
        journeyVersionId: primaryVersion!.id,
        appointmentId: crypto.randomUUID(),
        mode: "live",
        status: "running",
        journeyNameSnapshot: primaryJourney.name,
        journeyVersionSnapshot: { version: publishedPrimary.version },
      })
      .returning({ id: journeyRuns.id });

    const [sameJourneyRun] = await db
      .insert(journeyRuns)
      .values({
        orgId: context.orgId,
        journeyVersionId: primaryVersion!.id,
        appointmentId: crypto.randomUUID(),
        mode: "live",
        status: "planned",
        journeyNameSnapshot: primaryJourney.name,
        journeyVersionSnapshot: { version: publishedPrimary.version },
      })
      .returning({ id: journeyRuns.id });

    const [terminalRun] = await db
      .insert(journeyRuns)
      .values({
        orgId: context.orgId,
        journeyVersionId: primaryVersion!.id,
        appointmentId: crypto.randomUUID(),
        mode: "live",
        status: "completed",
        journeyNameSnapshot: primaryJourney.name,
        journeyVersionSnapshot: { version: publishedPrimary.version },
      })
      .returning({ id: journeyRuns.id });

    const [otherJourneyRun] = await db
      .insert(journeyRuns)
      .values({
        orgId: context.orgId,
        journeyVersionId: secondaryVersion!.id,
        appointmentId: crypto.randomUUID(),
        mode: "live",
        status: "running",
        journeyNameSnapshot: secondaryJourney.name,
        journeyVersionSnapshot: { version: publishedSecondary.version },
      })
      .returning({ id: journeyRuns.id });

    await db.insert(journeyDeliveries).values([
      {
        orgId: context.orgId,
        journeyRunId: targetRun!.id,
        stepKey: "target-step",
        channel: "email",
        scheduledFor: new Date(),
        status: "planned",
        deterministicKey: `target-${crypto.randomUUID()}`,
      },
      {
        orgId: context.orgId,
        journeyRunId: sameJourneyRun!.id,
        stepKey: "same-journey-step",
        channel: "email",
        scheduledFor: new Date(),
        status: "planned",
        deterministicKey: `same-${crypto.randomUUID()}`,
      },
      {
        orgId: context.orgId,
        journeyRunId: terminalRun!.id,
        stepKey: "terminal-step",
        channel: "email",
        scheduledFor: new Date(),
        status: "sent",
        deterministicKey: `terminal-${crypto.randomUUID()}`,
      },
      {
        orgId: context.orgId,
        journeyRunId: otherJourneyRun!.id,
        stepKey: "other-journey-step",
        channel: "email",
        scheduledFor: new Date(),
        status: "planned",
        deterministicKey: `other-${crypto.randomUUID()}`,
      },
    ]);

    const singleCancel = await journeyService.cancelRun(targetRun!.id, context);
    expect(singleCancel.canceled).toBe(true);
    expect(singleCancel.run.id).toBe(targetRun!.id);
    expect(singleCancel.run.status).toBe("canceled");

    const terminalCancel = await journeyService.cancelRun(
      terminalRun!.id,
      context,
    );
    expect(terminalCancel.canceled).toBe(false);
    expect(terminalCancel.run.id).toBe(terminalRun!.id);
    expect(terminalCancel.run.status).toBe("completed");

    const bulkCancel = await journeyService.cancelRuns(
      primaryJourney.id,
      context,
    );
    expect(bulkCancel.canceledRunCount).toBe(1);

    const runRows = await db
      .select({ id: journeyRuns.id, status: journeyRuns.status })
      .from(journeyRuns)
      .where(
        inArray(journeyRuns.id, [
          targetRun!.id,
          sameJourneyRun!.id,
          terminalRun!.id,
          otherJourneyRun!.id,
        ]),
      );

    const statusesById = new Map(runRows.map((row) => [row.id, row.status]));

    expect(statusesById.get(targetRun!.id)).toBe("canceled");
    expect(statusesById.get(sameJourneyRun!.id)).toBe("canceled");
    expect(statusesById.get(terminalRun!.id)).toBe("completed");
    expect(statusesById.get(otherJourneyRun!.id)).toBe("running");

    const deliveryRows = await db
      .select({
        runId: journeyDeliveries.journeyRunId,
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(
        inArray(journeyDeliveries.journeyRunId, [
          targetRun!.id,
          sameJourneyRun!.id,
          terminalRun!.id,
          otherJourneyRun!.id,
        ]),
      );

    const deliveryStatusByRunId = new Map(
      deliveryRows.map((row) => [row.runId, row.status]),
    );

    expect(deliveryStatusByRunId.get(targetRun!.id)).toBe("canceled");
    expect(deliveryStatusByRunId.get(sameJourneyRun!.id)).toBe("canceled");
    expect(deliveryStatusByRunId.get(terminalRun!.id)).toBe("sent");
    expect(deliveryStatusByRunId.get(otherJourneyRun!.id)).toBe("planned");
  });

  test("delete cancels active runs then hard-deletes journey and versions", async () => {
    const created = await journeyService.create(
      {
        name: "Delete Journey",
        graph: createLinearGraph("trigger-delete"),
      },
      context,
    );

    const published = await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    await setTestOrgContext(db, context.orgId);
    const [versionRow] = await db
      .select({ id: journeyVersions.id })
      .from(journeyVersions)
      .where(
        and(
          eq(journeyVersions.journeyId, created.id),
          eq(journeyVersions.version, published.version),
        ),
      )
      .limit(1);

    expect(versionRow).toBeDefined();

    const [runningRun] = await db
      .insert(journeyRuns)
      .values({
        orgId: context.orgId,
        journeyVersionId: versionRow!.id,
        appointmentId: crypto.randomUUID(),
        mode: "live",
        status: "running",
        journeyNameSnapshot: created.name,
        journeyVersionSnapshot: { version: published.version },
      })
      .returning({ id: journeyRuns.id });

    const [plannedRun] = await db
      .insert(journeyRuns)
      .values({
        orgId: context.orgId,
        journeyVersionId: versionRow!.id,
        appointmentId: crypto.randomUUID(),
        mode: "live",
        status: "planned",
        journeyNameSnapshot: created.name,
        journeyVersionSnapshot: { version: published.version },
      })
      .returning({ id: journeyRuns.id });

    const [completedRun] = await db
      .insert(journeyRuns)
      .values({
        orgId: context.orgId,
        journeyVersionId: versionRow!.id,
        appointmentId: crypto.randomUUID(),
        mode: "live",
        status: "completed",
        journeyNameSnapshot: created.name,
        journeyVersionSnapshot: { version: published.version },
      })
      .returning({ id: journeyRuns.id });

    await db.insert(journeyDeliveries).values([
      {
        orgId: context.orgId,
        journeyRunId: runningRun!.id,
        stepKey: "send-running",
        channel: "email",
        scheduledFor: new Date(),
        status: "planned",
        deterministicKey: `running-${crypto.randomUUID()}`,
      },
      {
        orgId: context.orgId,
        journeyRunId: plannedRun!.id,
        stepKey: "send-planned",
        channel: "email",
        scheduledFor: new Date(),
        status: "planned",
        deterministicKey: `planned-${crypto.randomUUID()}`,
      },
      {
        orgId: context.orgId,
        journeyRunId: completedRun!.id,
        stepKey: "send-completed",
        channel: "email",
        scheduledFor: new Date(),
        status: "sent",
        deterministicKey: `completed-${crypto.randomUUID()}`,
      },
    ]);

    const deleted = await journeyService.delete(created.id, context);
    expect(deleted).toEqual({ success: true });

    await setTestOrgContext(db, context.orgId);

    const journeyRows = await db
      .select({ id: journeys.id })
      .from(journeys)
      .where(eq(journeys.id, created.id));
    expect(journeyRows).toHaveLength(0);

    const versionRows = await db
      .select({ id: journeyVersions.id })
      .from(journeyVersions)
      .where(eq(journeyVersions.journeyId, created.id));
    expect(versionRows).toHaveLength(0);

    const runRows = await db
      .select({ id: journeyRuns.id, status: journeyRuns.status })
      .from(journeyRuns)
      .where(
        inArray(journeyRuns.id, [
          runningRun!.id,
          plannedRun!.id,
          completedRun!.id,
        ]),
      );

    const statusesById = new Map(runRows.map((row) => [row.id, row.status]));
    expect(statusesById.get(runningRun!.id)).toBe("canceled");
    expect(statusesById.get(plannedRun!.id)).toBe("canceled");
    expect(statusesById.get(completedRun!.id)).toBe("completed");

    const deliveryRows = await db
      .select({
        runId: journeyDeliveries.journeyRunId,
        status: journeyDeliveries.status,
      })
      .from(journeyDeliveries)
      .where(
        inArray(journeyDeliveries.journeyRunId, [
          runningRun!.id,
          plannedRun!.id,
          completedRun!.id,
        ]),
      );

    const deliveryStatuses = deliveryRows.map((row) => row.status);
    expect(deliveryStatuses).toContain("canceled");
    expect(deliveryStatuses).toContain("sent");
  });

  test("manual test start creates a mode=test run", async () => {
    const location = await createLocation(db as any, context.orgId);
    const calendar = await createCalendar(db as any, context.orgId, {
      locationId: location.id,
    });
    const appointmentType = await createAppointmentType(
      db as any,
      context.orgId,
      {
        calendarIds: [calendar.id],
      },
    );
    const appointment = await createAppointment(db as any, context.orgId, {
      calendarId: calendar.id,
      appointmentTypeId: appointmentType.id,
      startAt: new Date("2026-03-10T14:00:00.000Z"),
      endAt: new Date("2026-03-10T15:00:00.000Z"),
    });

    const created = await journeyService.create(
      {
        name: "Manual Test Start Journey",
        graph: createLinearGraphWithSendMessage({ channel: "email" }),
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

    const result = await journeyService.startTestRun(
      created.id,
      {
        appointmentId: appointment.id,
      },
      context,
    );

    expect(result.mode).toBe("test");

    await setTestOrgContext(db, context.orgId);

    const [run] = await db
      .select({ id: journeyRuns.id, mode: journeyRuns.mode })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, result.runId))
      .limit(1);

    expect(run).toBeDefined();
    expect(run?.mode).toBe("test");

    const deliveries = await db
      .select({
        id: journeyDeliveries.id,
        journeyRunId: journeyDeliveries.journeyRunId,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, result.runId));

    expect(deliveries).toHaveLength(1);
  });

  test("manual test start allows email steps without requiring override", async () => {
    const location = await createLocation(db as any, context.orgId);
    const calendar = await createCalendar(db as any, context.orgId, {
      locationId: location.id,
    });
    const appointmentType = await createAppointmentType(
      db as any,
      context.orgId,
      {
        calendarIds: [calendar.id],
      },
    );
    const appointment = await createAppointment(db as any, context.orgId, {
      calendarId: calendar.id,
      appointmentTypeId: appointmentType.id,
      startAt: new Date("2026-03-10T14:00:00.000Z"),
      endAt: new Date("2026-03-10T15:00:00.000Z"),
    });

    const created = await journeyService.create(
      {
        name: "Email Test Mode Journey",
        graph: createLinearGraphWithSendMessage({ channel: "email" }),
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

    const result = await journeyService.startTestRun(
      created.id,
      {
        appointmentId: appointment.id,
      },
      context,
    );

    await setTestOrgContext(db, context.orgId);

    const runs = await db
      .select({ id: journeyRuns.id })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, result.runId));
    const deliveries = await db
      .select({ id: journeyDeliveries.id })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.journeyRunId, result.runId));

    expect(runs).toHaveLength(1);
    expect(deliveries).toHaveLength(1);
  });

  test("manual test start allows template email steps without requiring override", async () => {
    const location = await createLocation(db as any, context.orgId);
    const calendar = await createCalendar(db as any, context.orgId, {
      locationId: location.id,
    });
    const appointmentType = await createAppointmentType(
      db as any,
      context.orgId,
      {
        calendarIds: [calendar.id],
      },
    );
    const appointment = await createAppointment(db as any, context.orgId, {
      calendarId: calendar.id,
      appointmentTypeId: appointmentType.id,
      startAt: new Date("2026-03-10T14:00:00.000Z"),
      endAt: new Date("2026-03-10T15:00:00.000Z"),
    });

    const created = await journeyService.create(
      {
        name: "Template Email Test Mode Journey",
        graph: createLinearGraphWithSendMessage({ channel: "email-template" }),
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

    const result = await journeyService.startTestRun(
      created.id,
      {
        appointmentId: appointment.id,
      },
      context,
    );

    expect(result.mode).toBe("test");
  });

  test("manual test start allows slack steps without slack override", async () => {
    const location = await createLocation(db as any, context.orgId);
    const calendar = await createCalendar(db as any, context.orgId, {
      locationId: location.id,
    });
    const appointmentType = await createAppointmentType(
      db as any,
      context.orgId,
      {
        calendarIds: [calendar.id],
      },
    );
    const appointment = await createAppointment(db as any, context.orgId, {
      calendarId: calendar.id,
      appointmentTypeId: appointmentType.id,
      startAt: new Date("2026-03-10T14:00:00.000Z"),
      endAt: new Date("2026-03-10T15:00:00.000Z"),
    });

    const created = await journeyService.create(
      {
        name: "Slack Manual Test Journey",
        graph: createLinearGraphWithSendMessage({ channel: "slack" }),
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

    const result = await journeyService.startTestRun(
      created.id,
      {
        appointmentId: appointment.id,
      },
      context,
    );

    expect(result.mode).toBe("test");
  });

  test("publish returns non-blocking overlap warnings for matching trigger dimensions", async () => {
    const appointmentTypeId = crypto.randomUUID();

    await journeyService
      .create(
        {
          name: "Journey A",
          graph: createLinearGraphWithTriggerConfig({
            triggerId: "trigger-overlap-a",
            filter: {
              logic: "and",
              groups: [
                {
                  logic: "and",
                  conditions: [
                    {
                      field: "appointment.appointmentTypeId",
                      operator: "equals",
                      value: appointmentTypeId,
                    },
                  ],
                },
              ],
            },
          }),
        },
        context,
      )
      .then((created) =>
        journeyService.publish(
          created.id,
          {
            mode: "live",
          },
          context,
        ),
      );

    const createdB = await journeyService.create(
      {
        name: "Journey B",
        graph: createLinearGraphWithTriggerConfig({
          triggerId: "trigger-overlap-b",
          filter: {
            logic: "and",
            groups: [
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.appointmentTypeId",
                    operator: "equals",
                    value: appointmentTypeId,
                  },
                ],
              },
            ],
          },
        }),
      },
      context,
    );

    const published = await journeyService.publish(
      createdB.id,
      {
        mode: "live",
      },
      context,
    );

    expect(published.journey.status).toBe("published");
    expect(published.warnings.length).toBeGreaterThan(0);
    expect(published.warnings[0]).toContain("Journey A");
  });

  test("run detail preserves snapshot history when definition is deleted", async () => {
    const created = await journeyService.create(
      {
        name: "History Journey",
        graph: createLinearGraph("trigger-history"),
      },
      context,
    );

    const published = await journeyService.publish(
      created.id,
      {
        mode: "live",
      },
      context,
    );

    await setTestOrgContext(db, context.orgId);
    const [versionRow] = await db
      .select({ id: journeyVersions.id })
      .from(journeyVersions)
      .where(
        and(
          eq(journeyVersions.journeyId, created.id),
          eq(journeyVersions.version, published.version),
        ),
      )
      .limit(1);

    const [runRow] = await db
      .insert(journeyRuns)
      .values({
        orgId: context.orgId,
        journeyVersionId: versionRow!.id,
        appointmentId: crypto.randomUUID(),
        mode: "test",
        status: "completed",
        journeyNameSnapshot: "Deleted Journey Snapshot",
        journeyVersionSnapshot: { version: 7 },
      })
      .returning({ id: journeyRuns.id });

    await db.insert(journeyDeliveries).values([
      {
        orgId: context.orgId,
        journeyRunId: runRow!.id,
        stepKey: "logger-1",
        channel: "logger",
        scheduledFor: new Date("2026-03-10T14:00:00.000Z"),
        status: "sent",
        reasonCode: null,
        deterministicKey: `logger-${crypto.randomUUID()}`,
      },
      {
        orgId: context.orgId,
        journeyRunId: runRow!.id,
        stepKey: "send-1",
        channel: "email",
        scheduledFor: new Date("2026-03-10T14:05:00.000Z"),
        status: "skipped",
        reasonCode: "past_due",
        deterministicKey: `send-${crypto.randomUUID()}`,
      },
    ]);

    await db.delete(journeys).where(eq(journeys.id, created.id));

    const runDetail = await journeyService.getRun(runRow!.id, context);

    expect(runDetail.run.journeyDeleted).toBe(true);
    expect(runDetail.run.journeyNameSnapshot).toBe("Deleted Journey Snapshot");
    expect(runDetail.run.journeyVersion).toBe(7);
    expect(runDetail.deliveries.map((delivery) => delivery.channel)).toContain(
      "logger",
    );
    expect(
      runDetail.deliveries.map((delivery) => delivery.reasonCode),
    ).toContain("past_due");
    expect(runDetail.events).toEqual([]);
    expect(runDetail.stepLogs).toEqual([]);
    expect(runDetail.triggerContext).toBeNull();
  });

  test("get/list fail with explicit conflict when stored definition is invalid", async () => {
    const created = await journeyService.create(
      {
        name: "Invalid Definition Journey",
        graph: createLinearGraph("trigger-invalid-definition"),
      },
      context,
    );

    await setTestOrgContext(db, context.orgId);
    await db
      .update(journeys)
      .set({
        draftDefinition: {
          attributes: {},
          options: { type: "directed" },
          nodes: [],
          edges: [],
        },
      })
      .where(eq(journeys.id, created.id));

    await expect(journeyService.get(created.id, context)).rejects.toMatchObject(
      {
        code: "CONFLICT",
        details: { code: "JOURNEY_DEFINITION_INVALID" },
      },
    );

    await expect(journeyService.list(context)).rejects.toMatchObject({
      code: "CONFLICT",
      details: { code: "JOURNEY_DEFINITION_INVALID" },
    });
  });
});
