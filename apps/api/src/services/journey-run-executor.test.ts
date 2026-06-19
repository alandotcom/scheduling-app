import { beforeEach, describe, expect, mock, test } from "bun:test";
import superjson from "superjson";
import { and, eq } from "drizzle-orm";
import {
  journeyDeliveries,
  journeyRunEvents,
  journeyRuns,
  journeyRunStepLogs,
} from "@scheduling/db/schema";
import {
  linearJourneyGraphSchema,
  type LinearJourneyGraph,
} from "@scheduling/dto";
import {
  getTestDb,
  registerDbTestReset,
  setTestOrgContext,
  type TestDatabase,
} from "../test-utils/index.js";
import { createOrg, createQuickAppointment } from "../test-utils/factories.js";
import {
  executeJourneyRun,
  type JourneyRunStartInput,
  type JourneyRunStepRuntime,
  type JourneyRunWaitForEventOptions,
} from "./journey-run-executor.js";

registerDbTestReset("per-file");

const db: TestDatabase = getTestDb();

const EVENT_TIMESTAMP = "2026-06-19T10:00:00.000Z";
const APPOINTMENT_START = "2026-06-19T18:00:00.000Z";
const FIXED_NOW = new Date("2026-06-19T11:30:00.000Z");

// The vertical slice: trigger -> condition -> wait -> send -> wait-for-confirmation -> send.
function createSliceGraph(input?: { expression?: string }): LinearJourneyGraph {
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
      {
        key: "wait-node",
        attributes: {
          id: "wait-node",
          type: "action-node",
          position: { x: 0, y: 240 },
          data: {
            type: "action",
            label: "Wait",
            config: { actionType: "wait", waitDuration: "1h" },
          },
        },
      },
      {
        key: "send-node-1",
        attributes: {
          id: "send-node-1",
          type: "action-node",
          position: { x: 0, y: 360 },
          data: {
            type: "action",
            label: "Reminder",
            config: { actionType: "send-resend" },
          },
        },
      },
      {
        key: "wfc-node",
        attributes: {
          id: "wfc-node",
          type: "action-node",
          position: { x: 0, y: 480 },
          data: {
            type: "action",
            label: "Wait For Confirmation",
            config: {
              actionType: "wait-for-confirmation",
              confirmationGraceMinutes: 0,
            },
          },
        },
      },
      {
        key: "send-node-2",
        attributes: {
          id: "send-node-2",
          type: "action-node",
          position: { x: 0, y: 600 },
          data: {
            type: "action",
            label: "Thank You",
            config: { actionType: "send-resend" },
          },
        },
      },
    ],
    edges: [
      edge("e1", "trigger-node", "condition-node"),
      {
        key: "e2",
        source: "condition-node",
        target: "wait-node",
        attributes: {
          id: "e2",
          source: "condition-node",
          target: "wait-node",
          data: { conditionBranch: "true" },
        },
      },
      edge("e3", "wait-node", "send-node-1"),
      edge("e4", "send-node-1", "wfc-node"),
      edge("e5", "wfc-node", "send-node-2"),
    ],
  };
}

function edge(id: string, source: string, target: string) {
  return {
    key: id,
    source,
    target,
    attributes: { id, source, target },
  };
}

// The trigger's Scheduled branch fans out to two sends that both run.
function createFanOutGraph(): LinearJourneyGraph {
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
        key: "send-a",
        attributes: {
          id: "send-a",
          type: "action-node",
          position: { x: 0, y: 120 },
          data: {
            type: "action",
            label: "Send A",
            config: { actionType: "send-resend" },
          },
        },
      },
      {
        key: "send-b",
        attributes: {
          id: "send-b",
          type: "action-node",
          position: { x: 200, y: 120 },
          data: {
            type: "action",
            label: "Send B",
            config: { actionType: "send-resend" },
          },
        },
      },
    ],
    edges: [
      {
        key: "e-a",
        source: "trigger-node",
        target: "send-a",
        attributes: {
          id: "e-a",
          source: "trigger-node",
          target: "send-a",
          data: { triggerBranch: "scheduled" },
        },
      },
      {
        key: "e-b",
        source: "trigger-node",
        target: "send-b",
        attributes: {
          id: "e-b",
          source: "trigger-node",
          target: "send-b",
          data: { triggerBranch: "scheduled" },
        },
      },
    ],
  };
}

function buildContext() {
  return {
    appointmentContext: {
      calendarRequiresConfirmation: true,
      status: "scheduled",
      startAt: APPOINTMENT_START,
      appointment: {
        calendarRequiresConfirmation: true,
        status: "scheduled",
        startAt: APPOINTMENT_START,
      },
    },
    clientContext: {},
    orgTimezone: "UTC",
  };
}

type FakeRuntime = {
  runtime: JourneyRunStepRuntime;
  memo: Map<string, string>;
  sleeps: string[];
  waits: string[];
};

function createFakeRuntime(input: {
  memo?: Map<string, string>;
  waitForEvent: (
    stepId: string,
    options: JourneyRunWaitForEventOptions,
  ) => { name: string; data: Record<string, unknown> } | null;
  throwOnSleep?: { stepId: string };
}): FakeRuntime {
  const memo = input.memo ?? new Map<string, string>();
  const sleeps: string[] = [];
  const waits: string[] = [];

  const runtime: JourneyRunStepRuntime = {
    runStep: async <T>(stepId: string, fn: () => Promise<T>): Promise<T> => {
      const cached = memo.get(stepId);
      if (cached !== undefined) {
        return superjson.parse<T>(cached);
      }
      const value = await fn();
      memo.set(stepId, superjson.stringify(value));
      return value;
    },
    sleepUntil: async (stepId: string) => {
      sleeps.push(stepId);
      if (input.throwOnSleep && input.throwOnSleep.stepId === stepId) {
        // Simulate the function suspending at a durable sleep: control leaves the
        // function and resumes on a later invocation that reuses the memo cache.
        throw new Error(`__suspend_at_${stepId}`);
      }
    },
    waitForEvent: async (stepId, options) => {
      waits.push(stepId);
      return input.waitForEvent(stepId, options);
    },
  };

  return { runtime, memo, sleeps, waits };
}

async function seedInngestRun(
  orgId: string,
  graph: LinearJourneyGraph,
  status: "planned" | "running" | "canceled" = "planned",
): Promise<{ runId: string; appointmentId: string }> {
  const appointmentId = await createQuickAppointment(db, orgId);
  await setTestOrgContext(db, orgId);
  const [run] = await db
    .insert(journeyRuns)
    .values({
      orgId,
      journeyVersionId: null,
      triggerEntityType: "appointment",
      triggerEntityId: appointmentId,
      appointmentId,
      mode: "live",
      status,
      journeyNameSnapshot: "Slice Journey",
      journeyVersionSnapshot: {
        version: 1,
        definitionSnapshot: graph,
        publishedAt: EVENT_TIMESTAMP,
      },
    })
    .returning({ id: journeyRuns.id });

  return { runId: run!.id, appointmentId };
}

function startInput(input: {
  orgId: string;
  runId: string;
  appointmentId: string;
}): JourneyRunStartInput {
  return {
    orgId: input.orgId,
    journeyRunId: input.runId,
    journeyId: "journey-under-test",
    journeyVersionId: null,
    triggerEntityType: "appointment",
    triggerEntityId: input.appointmentId,
    appointmentId: input.appointmentId,
    clientId: null,
    mode: "live",
    triggerBranch: "scheduled",
    triggerEventType: "appointment.scheduled",
    eventTimestamp: EVENT_TIMESTAMP,
  };
}

async function readRunStatus(runId: string): Promise<string> {
  const [row] = await db
    .select({ status: journeyRuns.status })
    .from(journeyRuns)
    .where(eq(journeyRuns.id, runId))
    .limit(1);
  return row!.status;
}

async function readStepKeys(orgId: string, runId: string): Promise<string[]> {
  await setTestOrgContext(db, orgId);
  const rows = await db
    .select({ stepKey: journeyRunStepLogs.stepKey })
    .from(journeyRunStepLogs)
    .where(eq(journeyRunStepLogs.journeyRunId, runId));
  return rows.map((r) => r.stepKey).sort();
}

async function readEventTypes(orgId: string, runId: string): Promise<string[]> {
  await setTestOrgContext(db, orgId);
  const rows = await db
    .select({ eventType: journeyRunEvents.eventType })
    .from(journeyRunEvents)
    .where(eq(journeyRunEvents.journeyRunId, runId));
  return rows.map((r) => r.eventType);
}

async function countDeliveries(orgId: string, runId: string): Promise<number> {
  await setTestOrgContext(db, orgId);
  const rows = await db
    .select({ id: journeyDeliveries.id })
    .from(journeyDeliveries)
    .where(
      and(
        eq(journeyDeliveries.journeyRunId, runId),
        eq(journeyDeliveries.status, "sent"),
      ),
    );
  return rows.length;
}

describe("executeJourneyRun", () => {
  beforeEach(async () => {
    await setTestOrgContext(db, "00000000-0000-0000-0000-000000000000");
  });

  test("walks the full slice and projects step logs, deliveries, and run events", async () => {
    const { org } = await createOrg(db);
    const graph = createSliceGraph();
    // Fail fast if the fixture graph is not a valid journey graph.
    expect(linearJourneyGraphSchema.safeParse(graph).success).toBe(true);

    const { runId, appointmentId } = await seedInngestRun(org.id, graph);
    const loadContext = mock(async () => buildContext());
    const dispatchDelivery = mock(async () => ({
      providerMessageId: "msg-1",
    }));
    const { runtime, sleeps, waits } = createFakeRuntime({
      waitForEvent: () => ({
        name: "appointment.confirmed",
        data: { appointmentId },
      }),
    });

    const result = await executeJourneyRun(
      startInput({ orgId: org.id, runId, appointmentId }),
      { runtime, loadContext, dispatchDelivery, now: () => FIXED_NOW },
    );

    expect(result.status).toBe("completed");
    expect(result.outcome).toBe("completed");
    expect(result.visitedNodeIds).toEqual([
      "condition-node",
      "wait-node",
      "send-node-1",
      "wfc-node",
      "send-node-2",
    ]);

    expect(sleeps).toEqual(["wait:wait-node"]);
    expect(waits).toEqual(["confirm:wfc-node"]);
    expect(dispatchDelivery).toHaveBeenCalledTimes(2);

    expect(await readRunStatus(runId)).toBe("completed");
    expect(await readStepKeys(org.id, runId)).toEqual([
      "condition-node",
      "send-node-1",
      "send-node-2",
      "trigger-node",
      "wait-node",
      "wfc-node",
    ]);
    expect(await countDeliveries(org.id, runId)).toBe(2);

    const eventTypes = await readEventTypes(org.id, runId);
    expect(eventTypes).toContain("run_started");
    expect(eventTypes).toContain("run_waiting");
    expect(eventTypes).toContain("run_waiting_confirmation");
    expect(eventTypes).toContain("run_confirmation_received");
    expect(eventTypes).toContain("run_completed");
    expect(eventTypes.filter((type) => type === "delivery_sent")).toHaveLength(
      2,
    );
  });

  test("ends after wait-for-confirmation timeout without the final send", async () => {
    const { org } = await createOrg(db);
    const graph = createSliceGraph();
    const { runId, appointmentId } = await seedInngestRun(org.id, graph);
    const loadContext = mock(async () => buildContext());
    const dispatchDelivery = mock(async () => ({ providerMessageId: "msg" }));
    const { runtime } = createFakeRuntime({
      waitForEvent: () => null, // timeout
    });

    const result = await executeJourneyRun(
      startInput({ orgId: org.id, runId, appointmentId }),
      { runtime, loadContext, dispatchDelivery, now: () => FIXED_NOW },
    );

    expect(result.outcome).toBe("confirmation_timed_out");
    expect(result.status).toBe("completed");
    expect(result.visitedNodeIds).toEqual([
      "condition-node",
      "wait-node",
      "send-node-1",
      "wfc-node",
    ]);
    // Only the reminder fired; the post-confirmation send did not.
    expect(dispatchDelivery).toHaveBeenCalledTimes(1);
    expect(await countDeliveries(org.id, runId)).toBe(1);
    expect(await readEventTypes(org.id, runId)).toContain(
      "run_confirmation_timeout",
    );
  });

  test("resumes after a mid-wait crash without re-running memoized steps or re-sending", async () => {
    const { org } = await createOrg(db);
    const graph = createSliceGraph();
    const { runId, appointmentId } = await seedInngestRun(org.id, graph);
    const loadContext = mock(async () => buildContext());
    const dispatchDelivery = mock(async () => ({ providerMessageId: "msg" }));

    // Shared memo cache simulates Inngest checkpointing across invocations.
    const memo = new Map<string, string>();
    const crashing = createFakeRuntime({
      memo,
      waitForEvent: () => ({
        name: "appointment.confirmed",
        data: { appointmentId },
      }),
      throwOnSleep: { stepId: "wait:wait-node" },
    });

    // Invocation 1 suspends at the durable wait.
    await expect(
      executeJourneyRun(startInput({ orgId: org.id, runId, appointmentId }), {
        runtime: crashing.runtime,
        loadContext,
        dispatchDelivery,
        now: () => FIXED_NOW,
      }),
    ).rejects.toThrow("__suspend_at_wait:wait-node");

    expect(dispatchDelivery).toHaveBeenCalledTimes(0);
    const loadContextCallsAfterCrash = loadContext.mock.calls.length;

    // Invocation 2 replays with the same memo cache and runs to completion.
    const resumed = createFakeRuntime({
      memo,
      waitForEvent: () => ({
        name: "appointment.confirmed",
        data: { appointmentId },
      }),
    });
    const result = await executeJourneyRun(
      startInput({ orgId: org.id, runId, appointmentId }),
      {
        runtime: resumed.runtime,
        loadContext,
        dispatchDelivery,
        now: () => FIXED_NOW,
      },
    );

    expect(result.status).toBe("completed");
    // Both sends happened exactly once across the two invocations.
    expect(dispatchDelivery).toHaveBeenCalledTimes(2);
    expect(await countDeliveries(org.id, runId)).toBe(2);
    // Pre-crash steps (load-run, init-run, load-context, condition, wait-enter)
    // were memoized: the second invocation only loaded fresh context for the
    // post-wait reload and the post-confirmation reload.
    expect(loadContext.mock.calls.length).toBe(loadContextCallsAfterCrash + 2);
    // run_started recorded exactly once despite the replay (memoized step).
    const eventTypes = await readEventTypes(org.id, runId);
    expect(eventTypes.filter((type) => type === "run_started")).toHaveLength(1);
    expect(eventTypes.filter((type) => type === "delivery_sent")).toHaveLength(
      2,
    );
  });

  test("skips a run that is already terminal", async () => {
    const { org } = await createOrg(db);
    const graph = createSliceGraph();
    const { runId, appointmentId } = await seedInngestRun(
      org.id,
      graph,
      "canceled",
    );
    const loadContext = mock(async () => buildContext());
    const dispatchDelivery = mock(async () => ({ providerMessageId: "msg" }));
    const { runtime } = createFakeRuntime({ waitForEvent: () => null });

    const result = await executeJourneyRun(
      startInput({ orgId: org.id, runId, appointmentId }),
      { runtime, loadContext, dispatchDelivery, now: () => FIXED_NOW },
    );

    expect(result.outcome).toBe("skipped_terminal");
    expect(result.status).toBe("canceled");
    expect(dispatchDelivery).toHaveBeenCalledTimes(0);
  });

  test("does not advance the condition when it evaluates false", async () => {
    const { org } = await createOrg(db);
    const graph = createSliceGraph({ expression: "false" });
    const { runId, appointmentId } = await seedInngestRun(org.id, graph);
    const loadContext = mock(async () => buildContext());
    const dispatchDelivery = mock(async () => ({ providerMessageId: "msg" }));
    const { runtime, sleeps } = createFakeRuntime({
      waitForEvent: () => null,
    });

    const result = await executeJourneyRun(
      startInput({ orgId: org.id, runId, appointmentId }),
      { runtime, loadContext, dispatchDelivery, now: () => FIXED_NOW },
    );

    expect(result.status).toBe("completed");
    expect(result.visitedNodeIds).toEqual(["condition-node"]);
    expect(sleeps).toHaveLength(0);
    expect(dispatchDelivery).toHaveBeenCalledTimes(0);
  });

  test("fans out a trigger branch to multiple nodes that all run", async () => {
    const { org } = await createOrg(db);
    const graph = createFanOutGraph();
    expect(linearJourneyGraphSchema.safeParse(graph).success).toBe(true);

    const { runId, appointmentId } = await seedInngestRun(org.id, graph);
    const loadContext = mock(async () => buildContext());
    const dispatchDelivery = mock(async () => ({ providerMessageId: "msg" }));
    const { runtime } = createFakeRuntime({ waitForEvent: () => null });

    const result = await executeJourneyRun(
      startInput({ orgId: org.id, runId, appointmentId }),
      { runtime, loadContext, dispatchDelivery, now: () => FIXED_NOW },
    );

    expect(result.status).toBe("completed");
    expect([...result.visitedNodeIds].sort()).toEqual(["send-a", "send-b"]);
    // Both fan-out sends fired.
    expect(dispatchDelivery).toHaveBeenCalledTimes(2);
    expect(await countDeliveries(org.id, runId)).toBe(2);
    const stepKeys = await readStepKeys(org.id, runId);
    expect(stepKeys).toContain("send-a");
    expect(stepKeys).toContain("send-b");
  });
});
