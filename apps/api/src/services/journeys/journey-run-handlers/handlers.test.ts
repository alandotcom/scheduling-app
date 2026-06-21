import { beforeEach, describe, expect, mock, test } from "bun:test";
import { parse, stringify } from "superjson";
import { and, eq } from "drizzle-orm";
import {
  journeyDeliveries,
  journeyRunEvents,
  journeyRuns,
  journeyRunStepLogs,
} from "@scheduling/db/schema";
import type { LinearJourneyGraph } from "@scheduling/dto";
import {
  getTestDb,
  registerDbTestReset,
  setTestOrgContext,
  type TestDatabase,
} from "../../../test-utils/index.js";
import {
  createOrg,
  createQuickAppointment,
} from "../../../test-utils/factories.js";
import { JourneyDeliveryNonRetryableError } from "../delivery-dispatch-helpers.js";
import {
  buildNodeById,
  buildOutgoingEdgesBySource,
  type ActionNode,
} from "../journey-graph-walk.js";
import type {
  JourneyRunStepRuntime,
  JourneyRunWaitForEventOptions,
} from "../journey-run-executor.js";
import type { PlannerContext } from "../journey-run-steps.js";
import { conditionHandler } from "./condition-handler.js";
import type {
  JourneyRunGraphNav,
  JourneyRunHandlerDeps,
  JourneyRunIdentity,
  NodeExecutionContext,
} from "./handler-types.js";
import { sendHandler } from "./send-handler.js";
import { waitForConfirmationHandler } from "./wait-for-confirmation-handler.js";
import { waitHandler } from "./wait-handler.js";

// Node handlers are tested in isolation here: each is driven directly with the
// fake runtime + injected deps, against the real projection tables. The executor
// suite owns the end-to-end walk; these own one node type's lifecycle.

registerDbTestReset("per-file");

const db: TestDatabase = getTestDb();

const CURSOR = new Date("2026-06-19T11:30:00.000Z");
const APPOINTMENT_START = "2026-06-19T18:00:00.000Z";

type FakeRuntime = {
  runtime: JourneyRunStepRuntime;
  memo: Map<string, string>;
  sleeps: string[];
  waits: string[];
};

function createFakeRuntime(input?: {
  waitForEvent?: (
    stepId: string,
    options: JourneyRunWaitForEventOptions,
  ) => { name: string; data: Record<string, unknown> } | null;
}): FakeRuntime {
  const memo = new Map<string, string>();
  const sleeps: string[] = [];
  const waits: string[] = [];
  const runtime: JourneyRunStepRuntime = {
    runStep: async <T>(stepId: string, fn: () => Promise<T>): Promise<T> => {
      const cached = memo.get(stepId);
      if (cached !== undefined) {
        return parse<T>(cached);
      }
      const value = await fn();
      memo.set(stepId, stringify(value));
      return value;
    },
    sleepUntil: async (stepId: string) => {
      sleeps.push(stepId);
    },
    waitForEvent: async (stepId, options) => {
      waits.push(stepId);
      return input?.waitForEvent ? input.waitForEvent(stepId, options) : null;
    },
  };
  return { runtime, memo, sleeps, waits };
}

function buildContext(overrides?: {
  status?: string;
  requiresConfirmation?: boolean;
}): PlannerContext {
  const status = overrides?.status ?? "scheduled";
  const requiresConfirmation = overrides?.requiresConfirmation ?? true;
  return {
    appointmentContext: {
      calendarRequiresConfirmation: requiresConfirmation,
      status,
      startAt: APPOINTMENT_START,
      appointment: {
        calendarRequiresConfirmation: requiresConfirmation,
        status,
        startAt: APPOINTMENT_START,
      },
    },
    clientContext: {},
    orgTimezone: "UTC",
  };
}

async function seedRun(
  orgId: string,
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
      status: "running",
      journeyNameSnapshot: "Handler Test Journey",
      journeyVersionSnapshot: { version: 1, definitionSnapshot: {} },
    })
    .returning({ id: journeyRuns.id });
  return { runId: run!.id, appointmentId };
}

function makeCtx(input: {
  runtime: JourneyRunStepRuntime;
  node: ActionNode;
  actionType: string;
  stepKey: string;
  orgId: string;
  runId: string;
  appointmentId: string | null;
  nodeContext: PlannerContext;
  deps: Partial<JourneyRunHandlerDeps>;
  nav?: Partial<JourneyRunGraphNav>;
}): NodeExecutionContext {
  const identity: JourneyRunIdentity = {
    orgId: input.orgId,
    journeyRunId: input.runId,
    journeyId: "journey-under-test",
    triggerEntityType: "appointment",
    triggerEntityId: input.appointmentId ?? "missing",
    appointmentId: input.appointmentId,
    clientId: null,
    mode: "live",
    triggerEventType: "appointment.scheduled",
  };
  const deps: JourneyRunHandlerDeps = {
    dispatchDelivery:
      input.deps.dispatchDelivery ?? (async () => ({ providerMessageId: "m" })),
    loadContext: input.deps.loadContext ?? (async () => input.nodeContext),
    now: input.deps.now ?? (() => CURSOR),
    maxDispatchAttempts: input.deps.maxDispatchAttempts ?? 2,
  };
  const nav: JourneyRunGraphNav = {
    outgoingEdgesBySource: input.nav?.outgoingEdgesBySource ?? new Map(),
    successors: input.nav?.successors ?? (() => ["next-node"]),
  };
  return {
    runtime: input.runtime,
    node: input.node,
    actionType: input.actionType,
    stepKey: input.stepKey,
    label: "Test Node",
    cursor: CURSOR,
    nodeContext: input.nodeContext,
    identity,
    deps,
    nav,
  };
}

function sendNode(id: string): ActionNode {
  return {
    key: id,
    attributes: {
      id,
      type: "action-node",
      position: { x: 0, y: 0 },
      data: {
        type: "action",
        label: "Send",
        config: { actionType: "send-resend" },
      },
    },
  };
}

function waitNode(id: string): ActionNode {
  return {
    key: id,
    attributes: {
      id,
      type: "action-node",
      position: { x: 0, y: 0 },
      data: {
        type: "action",
        label: "Wait",
        config: { actionType: "wait", waitDuration: "1h" },
      },
    },
  };
}

function wfcNode(id: string): ActionNode {
  return {
    key: id,
    attributes: {
      id,
      type: "action-node",
      position: { x: 0, y: 0 },
      data: {
        type: "action",
        label: "Wait For Confirmation",
        config: {
          actionType: "wait-for-confirmation",
          confirmationGraceMinutes: 0,
        },
      },
    },
  };
}

function conditionGraph(expression: string): LinearJourneyGraph {
  return {
    attributes: {},
    options: { type: "directed" },
    nodes: [
      {
        key: "condition-node",
        attributes: {
          id: "condition-node",
          type: "action-node",
          position: { x: 0, y: 0 },
          data: {
            type: "action",
            label: "Condition",
            config: { actionType: "condition", expression },
          },
        },
      },
      sendNode("true-target"),
      sendNode("false-target"),
    ],
    edges: [
      {
        key: "e-true",
        source: "condition-node",
        target: "true-target",
        attributes: {
          id: "e-true",
          source: "condition-node",
          target: "true-target",
          data: { conditionBranch: "true" },
        },
      },
      {
        key: "e-false",
        source: "condition-node",
        target: "false-target",
        attributes: {
          id: "e-false",
          source: "condition-node",
          target: "false-target",
          data: { conditionBranch: "false" },
        },
      },
    ],
  };
}

async function deliveryStatuses(
  orgId: string,
  runId: string,
): Promise<string[]> {
  await setTestOrgContext(db, orgId);
  const rows = await db
    .select({ status: journeyDeliveries.status })
    .from(journeyDeliveries)
    .where(eq(journeyDeliveries.journeyRunId, runId));
  return rows.map((r) => r.status);
}

async function eventTypes(orgId: string, runId: string): Promise<string[]> {
  await setTestOrgContext(db, orgId);
  const rows = await db
    .select({ eventType: journeyRunEvents.eventType })
    .from(journeyRunEvents)
    .where(eq(journeyRunEvents.journeyRunId, runId));
  return rows.map((r) => r.eventType);
}

async function stepLogStatus(
  orgId: string,
  runId: string,
  stepKey: string,
): Promise<string | null> {
  await setTestOrgContext(db, orgId);
  const [row] = await db
    .select({ status: journeyRunStepLogs.status })
    .from(journeyRunStepLogs)
    .where(
      and(
        eq(journeyRunStepLogs.journeyRunId, runId),
        eq(journeyRunStepLogs.stepKey, stepKey),
      ),
    )
    .limit(1);
  return row?.status ?? null;
}

beforeEach(async () => {
  await setTestOrgContext(db, "00000000-0000-0000-0000-000000000000");
});

describe("sendHandler", () => {
  test("runs prepare/dispatch/finalize in order and advances", async () => {
    const { org } = await createOrg(db);
    const { runId, appointmentId } = await seedRun(org.id);
    const dispatchDelivery = mock(async () => ({ providerMessageId: "msg-1" }));
    const { runtime, memo } = createFakeRuntime();

    const result = await sendHandler(
      makeCtx({
        runtime,
        node: sendNode("send-node"),
        actionType: "send-resend",
        stepKey: "send-node",
        orgId: org.id,
        runId,
        appointmentId,
        nodeContext: buildContext(),
        deps: { dispatchDelivery },
      }),
    );

    expect(result.kind).toBe("advance");
    if (result.kind === "advance") {
      expect(result.nextNodeIds).toEqual(["next-node"]);
      expect(result.cursor).toEqual(CURSOR);
    }
    expect(dispatchDelivery).toHaveBeenCalledTimes(1);
    expect([...memo.keys()].sort()).toEqual([
      "send-finalize:send-node",
      "send-prepare:send-node",
      "send:send-node",
    ]);
    expect(await deliveryStatuses(org.id, runId)).toEqual(["sent"]);
  });

  test("async-callback send leaves the delivery planned", async () => {
    const { org } = await createOrg(db);
    const { runId, appointmentId } = await seedRun(org.id);
    const dispatchDelivery = mock(async () => ({
      providerMessageId: "SM-async",
      awaitingAsyncCallback: true,
    }));
    const { runtime } = createFakeRuntime();

    await sendHandler(
      makeCtx({
        runtime,
        node: sendNode("send-node"),
        actionType: "send-resend",
        stepKey: "send-node",
        orgId: org.id,
        runId,
        appointmentId,
        nodeContext: buildContext(),
        deps: { dispatchDelivery },
      }),
    );

    expect(await deliveryStatuses(org.id, runId)).toEqual(["planned"]);
    expect(await eventTypes(org.id, runId)).toContain(
      "delivery_provider_accepted",
    );
  });

  test("a transient error retries within the step then sends once", async () => {
    const { org } = await createOrg(db);
    const { runId, appointmentId } = await seedRun(org.id);
    let calls = 0;
    const dispatchDelivery = mock(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("transient");
      }
      return { providerMessageId: "msg-retry" };
    });
    const { runtime } = createFakeRuntime();

    await sendHandler(
      makeCtx({
        runtime,
        node: sendNode("send-node"),
        actionType: "send-resend",
        stepKey: "send-node",
        orgId: org.id,
        runId,
        appointmentId,
        nodeContext: buildContext(),
        deps: { dispatchDelivery },
      }),
    );

    expect(dispatchDelivery).toHaveBeenCalledTimes(2);
    expect(await deliveryStatuses(org.id, runId)).toEqual(["sent"]);
  });

  test("a non-retryable error is surfaced and not retried", async () => {
    const { org } = await createOrg(db);
    const { runId, appointmentId } = await seedRun(org.id);
    const dispatchDelivery = mock(async () => {
      throw new JourneyDeliveryNonRetryableError("invalid recipient");
    });
    const { runtime } = createFakeRuntime();

    await expect(
      sendHandler(
        makeCtx({
          runtime,
          node: sendNode("send-node"),
          actionType: "send-resend",
          stepKey: "send-node",
          orgId: org.id,
          runId,
          appointmentId,
          nodeContext: buildContext(),
          deps: { dispatchDelivery },
        }),
      ),
    ).rejects.toThrow("invalid recipient");
    expect(dispatchDelivery).toHaveBeenCalledTimes(1);
  });
});

describe("conditionHandler", () => {
  test("routes to the true branch when the expression matches", async () => {
    const { org } = await createOrg(db);
    const { runId, appointmentId } = await seedRun(org.id);
    const graph = conditionGraph("true");
    const node = buildNodeById(graph).get("condition-node")!;
    const { runtime } = createFakeRuntime();

    const result = await conditionHandler(
      makeCtx({
        runtime,
        node,
        actionType: "condition",
        stepKey: "condition-node",
        orgId: org.id,
        runId,
        appointmentId,
        nodeContext: buildContext(),
        deps: {},
        nav: { outgoingEdgesBySource: buildOutgoingEdgesBySource(graph) },
      }),
    );

    expect(result.kind).toBe("advance");
    if (result.kind === "advance") {
      expect(result.nextNodeIds).toEqual(["true-target"]);
    }
    expect(await stepLogStatus(org.id, runId, "condition-node")).toBe(
      "success",
    );
  });

  test("routes to the false branch when the expression does not match", async () => {
    const { org } = await createOrg(db);
    const { runId, appointmentId } = await seedRun(org.id);
    const graph = conditionGraph("false");
    const node = buildNodeById(graph).get("condition-node")!;
    const { runtime } = createFakeRuntime();

    const result = await conditionHandler(
      makeCtx({
        runtime,
        node,
        actionType: "condition",
        stepKey: "condition-node",
        orgId: org.id,
        runId,
        appointmentId,
        nodeContext: buildContext(),
        deps: {},
        nav: { outgoingEdgesBySource: buildOutgoingEdgesBySource(graph) },
      }),
    );

    expect(result.kind).toBe("advance");
    if (result.kind === "advance") {
      expect(result.nextNodeIds).toEqual(["false-target"]);
    }
  });
});

describe("waitHandler", () => {
  test("enters, sleeps, exits, reloads, and advances with the new cursor", async () => {
    const { org } = await createOrg(db);
    const { runId, appointmentId } = await seedRun(org.id);
    const reloaded = buildContext({ status: "confirmed" });
    const loadContext = mock(async () => reloaded);
    const { runtime, sleeps, memo } = createFakeRuntime();

    const result = await waitHandler(
      makeCtx({
        runtime,
        node: waitNode("wait-node"),
        actionType: "wait",
        stepKey: "wait-node",
        orgId: org.id,
        runId,
        appointmentId,
        nodeContext: buildContext(),
        deps: { loadContext },
      }),
    );

    expect(sleeps).toEqual(["wait:wait-node"]);
    expect([...memo.keys()].sort()).toEqual([
      "wait-enter:wait-node",
      "wait-exit:wait-node",
      "wait-reload:wait-node",
    ]);
    expect(result.kind).toBe("advance");
    if (result.kind === "advance") {
      expect(result.nextNodeIds).toEqual(["next-node"]);
      // The cursor advanced to the computed wait-until, not the entry cursor.
      expect(result.cursor.getTime()).toBeGreaterThan(CURSOR.getTime());
      expect(result.context).toEqual(reloaded);
    }
    expect(loadContext).toHaveBeenCalledTimes(1);
  });

  test("terminates canceled when the trigger entity vanishes on reload", async () => {
    const { org } = await createOrg(db);
    const { runId, appointmentId } = await seedRun(org.id);
    const loadContext = mock(async () => null);
    const { runtime } = createFakeRuntime();

    const result = await waitHandler(
      makeCtx({
        runtime,
        node: waitNode("wait-node"),
        actionType: "wait",
        stepKey: "wait-node",
        orgId: org.id,
        runId,
        appointmentId,
        nodeContext: buildContext(),
        deps: { loadContext },
      }),
    );

    expect(result.kind).toBe("terminate");
    if (result.kind === "terminate") {
      expect(result.result).toEqual({
        finalStatus: "canceled",
        outcome: "skipped_missing_context",
      });
    }
  });
});

describe("waitForConfirmationHandler", () => {
  test("advances without waiting when already confirmed", async () => {
    const { org } = await createOrg(db);
    const { runId, appointmentId } = await seedRun(org.id);
    const { runtime, waits } = createFakeRuntime();

    const result = await waitForConfirmationHandler(
      makeCtx({
        runtime,
        node: wfcNode("wfc-node"),
        actionType: "wait-for-confirmation",
        stepKey: "wfc-node",
        orgId: org.id,
        runId,
        appointmentId,
        nodeContext: buildContext({ status: "confirmed" }),
        deps: {},
      }),
    );

    expect(waits).toHaveLength(0);
    expect(result.kind).toBe("advance");
    if (result.kind === "advance") {
      expect(result.nextNodeIds).toEqual(["next-node"]);
    }
  });

  test("reloads and advances when the confirmation arrives", async () => {
    const { org } = await createOrg(db);
    const { runId, appointmentId } = await seedRun(org.id);
    const reloaded = buildContext({ status: "confirmed" });
    const loadContext = mock(async () => reloaded);
    const { runtime, waits } = createFakeRuntime({
      waitForEvent: () => ({
        name: "appointment.confirmed",
        data: { appointmentId },
      }),
    });

    const result = await waitForConfirmationHandler(
      makeCtx({
        runtime,
        node: wfcNode("wfc-node"),
        actionType: "wait-for-confirmation",
        stepKey: "wfc-node",
        orgId: org.id,
        runId,
        appointmentId,
        nodeContext: buildContext(),
        deps: { loadContext },
      }),
    );

    expect(waits).toEqual(["confirm:wfc-node"]);
    expect(result.kind).toBe("advance");
    if (result.kind === "advance") {
      expect(result.context).toEqual(reloaded);
    }
    expect(await eventTypes(org.id, runId)).toContain(
      "run_confirmation_received",
    );
  });

  test("terminates completed on confirmation timeout", async () => {
    const { org } = await createOrg(db);
    const { runId, appointmentId } = await seedRun(org.id);
    const { runtime } = createFakeRuntime({ waitForEvent: () => null });

    const result = await waitForConfirmationHandler(
      makeCtx({
        runtime,
        node: wfcNode("wfc-node"),
        actionType: "wait-for-confirmation",
        stepKey: "wfc-node",
        orgId: org.id,
        runId,
        appointmentId,
        nodeContext: buildContext(),
        deps: {},
      }),
    );

    expect(result.kind).toBe("terminate");
    if (result.kind === "terminate") {
      expect(result.result).toEqual({
        finalStatus: "completed",
        outcome: "confirmation_timed_out",
      });
    }
    expect(await eventTypes(org.id, runId)).toContain(
      "run_confirmation_timeout",
    );
  });
});
