import { beforeEach, describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import { eq } from "drizzle-orm";
import {
  createAppointment,
  createAppointmentType,
  createCalendar,
  createLocation,
  createOrg,
  createOrgMember,
  createTestContext,
  getTestDb,
  setTestOrgContext,
} from "../test-utils/index.js";
import {
  journeyDeliveries,
  journeyRuns,
  journeyVersions,
} from "@scheduling/db/schema";
import * as journeyRoutes from "./journeys.js";
import type { LinearJourneyGraph } from "@scheduling/dto";

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
          },
        },
      },
    ],
    edges: [],
  };
}

function createLinearGraphWithSendMessage(input?: {
  triggerId?: string;
  channel?: "email" | "slack";
}): LinearJourneyGraph {
  const triggerId = input?.triggerId ?? "trigger-send";
  const channel = input?.channel ?? "email";

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
            config: {
              triggerType: "DomainEvent",
              domain: "appointment",
              startEvents: ["appointment.scheduled"],
              restartEvents: ["appointment.rescheduled"],
              stopEvents: ["appointment.canceled"],
            },
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
              actionType: "send-message",
              channel,
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

function createBranchingGraph(
  triggerId = "trigger-branching",
): LinearJourneyGraph {
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
          },
        },
      },
      {
        key: "wait-step",
        attributes: {
          id: "wait-step",
          type: "action-node",
          position: {
            x: -80,
            y: 120,
          },
          data: {
            label: "Wait",
            type: "action",
            config: {
              actionType: "wait",
            },
          },
        },
      },
      {
        key: "logger-step",
        attributes: {
          id: "logger-step",
          type: "action-node",
          position: {
            x: 80,
            y: 120,
          },
          data: {
            label: "Logger",
            type: "action",
            config: {
              actionType: "logger",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: `${triggerId}-to-wait-step`,
        source: triggerId,
        target: "wait-step",
        attributes: {
          id: `${triggerId}-to-wait-step`,
          source: triggerId,
          target: "wait-step",
        },
      },
      {
        key: `${triggerId}-to-logger-step`,
        source: triggerId,
        target: "logger-step",
        attributes: {
          id: `${triggerId}-to-logger-step`,
          source: triggerId,
          target: "logger-step",
        },
      },
    ],
  };
}

function createGraphWithLegacyActionAlias(
  triggerId = "trigger-legacy-alias",
): LinearJourneyGraph {
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
          },
        },
      },
      {
        key: "legacy-send-step",
        attributes: {
          id: "legacy-send-step",
          type: "action-node",
          position: {
            x: 0,
            y: 120,
          },
          data: {
            label: "Legacy Email",
            type: "action",
            config: {
              actionType: "email",
              channel: "email",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: `${triggerId}-to-legacy-send-step`,
        source: triggerId,
        target: "legacy-send-step",
        attributes: {
          id: `${triggerId}-to-legacy-send-step`,
          source: triggerId,
          target: "legacy-send-step",
        },
      },
    ],
  };
}

describe("Journey Routes", () => {
  const db = getTestDb();

  let ownerContext: ReturnType<typeof createTestContext>;
  let memberContext: ReturnType<typeof createTestContext>;

  beforeEach(async () => {
    const primary = await createOrg(db, { name: "Journey Route Org" });
    const member = await createOrgMember(db, primary.org.id, {
      role: "member",
      email: "member@journey-route.org",
    });

    ownerContext = createTestContext({
      orgId: primary.org.id,
      userId: primary.user.id,
      role: "owner",
    });

    memberContext = createTestContext({
      orgId: primary.org.id,
      userId: member.id,
      role: "member",
    });
  });

  test("member cannot mutate journey lifecycle endpoints", async () => {
    const created = await call(
      journeyRoutes.create,
      {
        name: "Member Guard Journey",
        graph: createLinearGraph("trigger-guard"),
      },
      { context: ownerContext },
    );

    await expect(
      call(
        journeyRoutes.create,
        {
          name: "Forbidden Create",
          graph: createLinearGraph("trigger-forbidden-create"),
        },
        { context: memberContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      call(
        journeyRoutes.publish,
        { id: created.id, data: { mode: "live" } },
        { context: memberContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      call(journeyRoutes.pause, { id: created.id }, { context: memberContext }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      call(
        journeyRoutes.resume,
        { id: created.id, data: { targetState: "published" } },
        { context: memberContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      call(
        journeyRoutes.remove,
        { id: created.id },
        { context: memberContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      call(
        journeyRoutes.startTestRun,
        {
          id: created.id,
          data: {
            appointmentId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d88",
            emailOverride: "qa@example.com",
          },
        },
        { context: memberContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      call(
        journeyRoutes.cancelRun,
        {
          runId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d88",
        },
        { context: memberContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      call(
        journeyRoutes.cancelRuns,
        {
          id: created.id,
        },
        { context: memberContext },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("duplicate names are rejected and lifecycle route wiring creates versions", async () => {
    const created = await call(
      journeyRoutes.create,
      {
        name: "Route Lifecycle Journey",
        graph: createLinearGraph("trigger-route-lifecycle"),
      },
      { context: ownerContext },
    );
    expect(created.state).toBe("draft");

    await expect(
      call(
        journeyRoutes.create,
        {
          name: "route lifecycle journey",
          graph: createLinearGraph("trigger-route-duplicate"),
        },
        { context: ownerContext },
      ),
    ).rejects.toMatchObject({
      message: "Journey name already exists",
    });

    const publishResult = await call(
      journeyRoutes.publish,
      {
        id: created.id,
        data: {
          mode: "live",
        },
      },
      { context: ownerContext },
    );

    expect(publishResult.journey.state).toBe("published");
    expect(publishResult.version).toBe(1);

    const paused = await call(
      journeyRoutes.pause,
      { id: created.id },
      { context: ownerContext },
    );
    expect(paused.state).toBe("paused");

    const resumed = await call(
      journeyRoutes.resume,
      {
        id: created.id,
        data: {
          targetState: "published",
        },
      },
      { context: ownerContext },
    );
    expect(resumed.state).toBe("published");

    await setTestOrgContext(db, ownerContext.orgId!);
    const versions = await db
      .select({ id: journeyVersions.id })
      .from(journeyVersions)
      .where(eq(journeyVersions.journeyId, created.id));
    expect(versions).toHaveLength(1);

    const deleted = await call(
      journeyRoutes.remove,
      { id: created.id },
      { context: ownerContext },
    );
    expect(deleted).toEqual({ success: true });
  });

  test("create rejects invalid trigger filter payloads with structured issues", async () => {
    const invalidGraph = createLinearGraph("trigger-invalid-filter");
    const [triggerNode] = invalidGraph.nodes;

    if (triggerNode?.attributes.data.type === "trigger") {
      triggerNode.attributes.data.config = {
        triggerType: "DomainEvent",
        domain: "appointment",
        startEvents: ["appointment.scheduled"],
        restartEvents: [],
        stopEvents: ["appointment.canceled"],
        filter: {
          logic: "and",
          groups: [
            {
              logic: "and",
              conditions: [
                {
                  field: "internal.secret",
                  operator: "contains",
                  value: ["nope"],
                },
              ],
            },
          ],
        },
      };
    }

    await expect(
      call(
        journeyRoutes.create,
        {
          name: "Invalid Filter Journey",
          graph: invalidGraph,
        },
        { context: ownerContext },
      ),
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });

    const journeys = await call(journeyRoutes.list, undefined, {
      context: ownerContext,
    });

    expect(journeys).toHaveLength(0);
  });

  test("create rejects non-linear branching payloads without side effects", async () => {
    await expect(
      call(
        journeyRoutes.create,
        {
          name: "Branching Route Journey",
          graph: createBranchingGraph(),
        },
        { context: ownerContext },
      ),
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });

    const journeys = await call(journeyRoutes.list, undefined, {
      context: ownerContext,
    });

    expect(journeys).toHaveLength(0);
  });

  test("update rejects non-linear branching payloads without mutating stored draft", async () => {
    const created = await call(
      journeyRoutes.create,
      {
        name: "Update Branching Guard Journey",
        graph: createLinearGraph("trigger-update-branching"),
      },
      { context: ownerContext },
    );

    await expect(
      call(
        journeyRoutes.update,
        {
          id: created.id,
          data: {
            name: "Should Not Persist",
            graph: createBranchingGraph("trigger-update-branching-invalid"),
          },
        },
        { context: ownerContext },
      ),
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });

    const reloaded = await call(
      journeyRoutes.get,
      { id: created.id },
      { context: ownerContext },
    );

    expect(reloaded.name).toBe("Update Branching Guard Journey");
    expect(reloaded.graph.nodes).toHaveLength(1);
    expect(reloaded.graph.edges).toHaveLength(0);
  });

  test("create rejects legacy action aliases outside supported step set", async () => {
    await expect(
      call(
        journeyRoutes.create,
        {
          name: "Legacy Alias Route Journey",
          graph: createGraphWithLegacyActionAlias(),
        },
        { context: ownerContext },
      ),
    ).rejects.toMatchObject({
      message: "Input validation failed",
    });
  });

  test("manual test run route starts mode=test run", async () => {
    const location = await createLocation(db, ownerContext.orgId!);
    const calendar = await createCalendar(db, ownerContext.orgId!, {
      locationId: location.id,
    });
    const appointmentType = await createAppointmentType(
      db,
      ownerContext.orgId!,
      {
        calendarIds: [calendar.id],
      },
    );
    const appointment = await createAppointment(db, ownerContext.orgId!, {
      calendarId: calendar.id,
      appointmentTypeId: appointmentType.id,
      startAt: new Date("2026-03-10T14:00:00.000Z"),
      endAt: new Date("2026-03-10T15:00:00.000Z"),
    });

    const created = await call(
      journeyRoutes.create,
      {
        name: "Route Test Run Journey",
        graph: createLinearGraphWithSendMessage({ channel: "email" }),
      },
      { context: ownerContext },
    );

    await call(
      journeyRoutes.publish,
      {
        id: created.id,
        data: {
          mode: "live",
        },
      },
      { context: ownerContext },
    );

    const started = await call(
      journeyRoutes.startTestRun,
      {
        id: created.id,
        data: {
          appointmentId: appointment.id,
          emailOverride: "qa@example.com",
        },
      },
      { context: ownerContext },
    );

    expect(started.mode).toBe("test");
    expect(started.runId).toBeTruthy();
  });

  test("manual test run route rejects missing email override for email steps", async () => {
    const location = await createLocation(db, ownerContext.orgId!);
    const calendar = await createCalendar(db, ownerContext.orgId!, {
      locationId: location.id,
    });
    const appointmentType = await createAppointmentType(
      db,
      ownerContext.orgId!,
      {
        calendarIds: [calendar.id],
      },
    );
    const appointment = await createAppointment(db, ownerContext.orgId!, {
      calendarId: calendar.id,
      appointmentTypeId: appointmentType.id,
      startAt: new Date("2026-03-10T14:00:00.000Z"),
      endAt: new Date("2026-03-10T15:00:00.000Z"),
    });

    const created = await call(
      journeyRoutes.create,
      {
        name: "Route Missing Override Journey",
        graph: createLinearGraphWithSendMessage({ channel: "email" }),
      },
      { context: ownerContext },
    );

    await call(
      journeyRoutes.publish,
      {
        id: created.id,
        data: {
          mode: "live",
        },
      },
      { context: ownerContext },
    );

    await expect(
      call(
        journeyRoutes.startTestRun,
        {
          id: created.id,
          data: {
            appointmentId: appointment.id,
          },
        },
        { context: ownerContext },
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Email override is required for test runs with Email steps",
    });
  });

  test("runs endpoints expose mode filtering and snapshot detail fields", async () => {
    const created = await call(
      journeyRoutes.create,
      {
        name: "Runs Route Journey",
        graph: createLinearGraph("trigger-runs-route"),
      },
      { context: ownerContext },
    );

    const published = await call(
      journeyRoutes.publish,
      {
        id: created.id,
        data: {
          mode: "live",
        },
      },
      { context: ownerContext },
    );

    await setTestOrgContext(db, ownerContext.orgId!);
    const [versionRow] = await db
      .select({ id: journeyVersions.id })
      .from(journeyVersions)
      .where(eq(journeyVersions.journeyId, created.id))
      .limit(1);

    const [liveRun] = await db
      .insert(journeyRuns)
      .values({
        orgId: ownerContext.orgId!,
        journeyVersionId: versionRow!.id,
        appointmentId: crypto.randomUUID(),
        mode: "live",
        status: "completed",
        journeyNameSnapshot: created.name,
        journeyVersionSnapshot: { version: published.version },
      })
      .returning({ id: journeyRuns.id });

    const [testRun] = await db
      .insert(journeyRuns)
      .values({
        orgId: ownerContext.orgId!,
        journeyVersionId: versionRow!.id,
        appointmentId: crypto.randomUUID(),
        mode: "test",
        status: "completed",
        journeyNameSnapshot: created.name,
        journeyVersionSnapshot: { version: published.version },
      })
      .returning({ id: journeyRuns.id });

    const testRuns = await call(
      journeyRoutes.listRuns,
      {
        id: created.id,
        mode: "test",
      },
      { context: ownerContext },
    );

    expect(testRuns).toHaveLength(1);
    expect(testRuns[0]?.mode).toBe("test");

    await db
      .delete(journeyVersions)
      .where(eq(journeyVersions.id, versionRow!.id));

    const runDetail = await call(
      journeyRoutes.getRun,
      {
        runId: testRun!.id,
      },
      { context: ownerContext },
    );

    expect(runDetail.run.id).toBe(testRun!.id);
    expect(runDetail.run.journeyDeleted).toBe(true);
    expect(runDetail.run.journeyVersion).toBe(published.version);
    expect(runDetail.run.mode).toBe("test");
    expect(liveRun).toBeDefined();
  });

  test("run cancel endpoints enforce individual and bulk cancellation scope", async () => {
    const primaryJourney = await call(
      journeyRoutes.create,
      {
        name: "Route Cancel Scope A",
        graph: createLinearGraph("trigger-route-cancel-a"),
      },
      { context: ownerContext },
    );

    const secondaryJourney = await call(
      journeyRoutes.create,
      {
        name: "Route Cancel Scope B",
        graph: createLinearGraph("trigger-route-cancel-b"),
      },
      { context: ownerContext },
    );

    const publishedPrimary = await call(
      journeyRoutes.publish,
      {
        id: primaryJourney.id,
        data: {
          mode: "live",
        },
      },
      { context: ownerContext },
    );

    const publishedSecondary = await call(
      journeyRoutes.publish,
      {
        id: secondaryJourney.id,
        data: {
          mode: "live",
        },
      },
      { context: ownerContext },
    );

    await setTestOrgContext(db, ownerContext.orgId!);

    const [primaryVersion] = await db
      .select({ id: journeyVersions.id })
      .from(journeyVersions)
      .where(eq(journeyVersions.journeyId, primaryJourney.id))
      .limit(1);

    const [secondaryVersion] = await db
      .select({ id: journeyVersions.id })
      .from(journeyVersions)
      .where(eq(journeyVersions.journeyId, secondaryJourney.id))
      .limit(1);

    const [targetRun] = await db
      .insert(journeyRuns)
      .values({
        orgId: ownerContext.orgId!,
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
        orgId: ownerContext.orgId!,
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
        orgId: ownerContext.orgId!,
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
        orgId: ownerContext.orgId!,
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
        orgId: ownerContext.orgId!,
        journeyRunId: targetRun!.id,
        stepKey: "target-run-step",
        channel: "email",
        scheduledFor: new Date(),
        status: "planned",
        deterministicKey: `target-${crypto.randomUUID()}`,
      },
      {
        orgId: ownerContext.orgId!,
        journeyRunId: sameJourneyRun!.id,
        stepKey: "same-run-step",
        channel: "email",
        scheduledFor: new Date(),
        status: "planned",
        deterministicKey: `same-${crypto.randomUUID()}`,
      },
      {
        orgId: ownerContext.orgId!,
        journeyRunId: terminalRun!.id,
        stepKey: "terminal-run-step",
        channel: "email",
        scheduledFor: new Date(),
        status: "sent",
        deterministicKey: `terminal-${crypto.randomUUID()}`,
      },
      {
        orgId: ownerContext.orgId!,
        journeyRunId: otherJourneyRun!.id,
        stepKey: "other-run-step",
        channel: "email",
        scheduledFor: new Date(),
        status: "planned",
        deterministicKey: `other-${crypto.randomUUID()}`,
      },
    ]);

    const canceledRun = await call(
      journeyRoutes.cancelRun,
      {
        runId: targetRun!.id,
      },
      { context: ownerContext },
    );

    expect(canceledRun.canceled).toBe(true);
    expect(canceledRun.run.id).toBe(targetRun!.id);
    expect(canceledRun.run.status).toBe("canceled");

    const terminalCancel = await call(
      journeyRoutes.cancelRun,
      {
        runId: terminalRun!.id,
      },
      { context: ownerContext },
    );

    expect(terminalCancel.canceled).toBe(false);
    expect(terminalCancel.run.id).toBe(terminalRun!.id);
    expect(terminalCancel.run.status).toBe("completed");

    const bulkCancel = await call(
      journeyRoutes.cancelRuns,
      {
        id: primaryJourney.id,
      },
      { context: ownerContext },
    );

    expect(bulkCancel.canceledRunCount).toBe(1);

    const [targetRunRow] = await db
      .select({ status: journeyRuns.status })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, targetRun!.id))
      .limit(1);

    const [sameJourneyRunRow] = await db
      .select({ status: journeyRuns.status })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, sameJourneyRun!.id))
      .limit(1);

    const [terminalRunRow] = await db
      .select({ status: journeyRuns.status })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, terminalRun!.id))
      .limit(1);

    const [otherJourneyRunRow] = await db
      .select({ status: journeyRuns.status })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, otherJourneyRun!.id))
      .limit(1);

    expect(targetRunRow?.status).toBe("canceled");
    expect(sameJourneyRunRow?.status).toBe("canceled");
    expect(terminalRunRow?.status).toBe("completed");
    expect(otherJourneyRunRow?.status).toBe("running");
  });
});
