import {
  linearJourneyGraphSchema,
  type JourneyRunMode,
  type LinearJourneyGraph,
  type TriggerBranch,
} from "@scheduling/dto";
import { journeyDeliveries, journeyRuns } from "@scheduling/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { retry } from "es-toolkit/function";
import { withOrg } from "../../lib/db.js";
import { toRecord } from "../../lib/type-guards.js";
import {
  JourneyDeliveryNonRetryableError,
  type JourneyDeliveryDispatcher,
  type JourneyDeliveryDispatchInput,
} from "./delivery-dispatch-helpers.js";
import {
  dispatchForActionType,
  getProviderForActionType,
} from "./delivery-provider-registry.js";
import {
  buildNodeById,
  buildOutgoingEdgesBySource,
  getActionConfig,
  getConditionExpression,
  getNormalizedActionType,
  getTriggerNode,
  isJourneyDeliveryActionType,
  resolveAppointmentRequiresConfirmation,
  resolveAppointmentStatus,
  resolveChannel,
  resolveConditionNextNodeIdForContext,
  resolveDefaultNextNodeIds,
  resolveTriggerNextNodeIds,
  resolveWaitCursor,
  resolveWaitForConfirmationTimeoutAt,
  toNumber,
  type ActionNode,
  type JourneyEdge,
} from "./journey-graph-walk.js";
import {
  appendJourneyRunEvent,
  upsertJourneyRunStepLog,
} from "./journey-run-artifacts.js";
import { loadFreshContextForPlannerByRun } from "./journey-template-context.js";

// The Inngest-native journey-run executor. A run is a single function that walks
// the pinned graph snapshot, calling one durable primitive per node. The walk is
// expressed against an injectable `runtime` (runStep / sleepUntil / waitForEvent)
// so the real Inngest function wires it to step.* while tests drive it with a
// fake runtime (a memo cache for replay, scripted waitForEvent for the race).
//
// Determinism contract: every read of mutable external state (appointment/client
// context, computed waitUntil, computed confirmation timeout, requiresConfirmation,
// appointmentStatus) happens INSIDE a memoized runStep, and all branch decisions
// are pure functions of memoized step outputs. Replays re-read the memoized values
// and take identical branches, so step ids stay stable.

const DEFAULT_MAX_DISPATCH_ATTEMPTS = 2;
const ACTIVE_RUN_STATUSES = ["planned", "running"] as const;

function isActiveRunStatus(status: string): boolean {
  return ACTIVE_RUN_STATUSES.some((active) => active === status);
}

export type JourneyRunStartInput = {
  orgId: string;
  journeyRunId: string;
  journeyId: string;
  journeyVersionId: string | null;
  triggerEntityType: "appointment" | "client";
  triggerEntityId: string;
  appointmentId: string | null;
  clientId: string | null;
  mode: JourneyRunMode;
  triggerBranch?: TriggerBranch;
  triggerEventType: string;
  eventTimestamp: string;
};

export type JourneyRunWaitForEventOptions = {
  event: string;
  timeout: Date;
  ifExpression?: string;
};

export type JourneyRunStepRuntime = {
  // Memoized durable step. Under Inngest this maps to step.run (round-tripped
  // through superjson); a successful step is checkpointed and its side effects
  // never replay. Tests back it with a Map keyed by stepId.
  runStep: <T>(stepId: string, fn: () => Promise<T>) => Promise<T>;
  // Durable sleep until an absolute instant. Returns immediately when already past.
  sleepUntil: (stepId: string, at: Date) => Promise<void>;
  // Durable wait-for-event; resolves with the matching event or null on timeout.
  waitForEvent: (
    stepId: string,
    options: JourneyRunWaitForEventOptions,
  ) => Promise<JourneyConfirmationEvent | null>;
};

export type JourneyConfirmationEvent = {
  name: string;
  data: Record<string, unknown>;
};

export type JourneyRunExecutorDependencies = {
  runtime: JourneyRunStepRuntime;
  dispatchDelivery?: JourneyDeliveryDispatcher;
  loadContext?: typeof loadFreshContextForPlannerByRun;
  now?: () => Date;
  maxDispatchAttempts?: number;
};

export type JourneyRunOutcome =
  | "completed"
  | "confirmation_timed_out"
  | "canceled"
  | "skipped_not_found"
  | "skipped_terminal"
  | "skipped_invalid_graph"
  | "skipped_missing_context";

export type JourneyRunExecutorResult = {
  journeyRunId: string;
  status: "planned" | "running" | "completed" | "canceled" | "failed";
  outcome: JourneyRunOutcome;
  visitedNodeIds: string[];
};

type PlannerContext = {
  appointmentContext: Record<string, unknown>;
  clientContext: Record<string, unknown>;
  orgTimezone: string;
};

type WalkResult = {
  finalStatus: "completed" | "canceled" | "failed";
  outcome: JourneyRunOutcome;
};

function parseGraph(snapshot: unknown): LinearJourneyGraph | null {
  const snapshotRecord = toRecord(snapshot);
  const parsed = linearJourneyGraphSchema.safeParse(
    snapshotRecord["definitionSnapshot"],
  );
  return parsed.success ? parsed.data : null;
}

function parseEventTimestamp(value: string, fallback: Date): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function successorsOf(
  nodeId: string,
  outgoingEdgesBySource: Map<string, JourneyEdge[]>,
): string[] {
  return resolveDefaultNextNodeIds({
    sourceNodeId: nodeId,
    outgoingEdgesBySource,
  });
}

// Combine the outcomes of fan-out branches: the run as a whole completes when all
// branches finish; a genuine failure/cancel on any branch is propagated, and a
// confirmation timeout on a branch is surfaced without failing the run.
function combineWalkResults(results: WalkResult[]): WalkResult {
  const failed = results.find((r) => r.finalStatus === "failed");
  if (failed) {
    return failed;
  }
  const canceled = results.find((r) => r.finalStatus === "canceled");
  if (canceled) {
    return canceled;
  }
  const timedOut = results.find((r) => r.outcome === "confirmation_timed_out");
  return {
    finalStatus: "completed",
    outcome: timedOut ? "confirmation_timed_out" : "completed",
  };
}

function resolveRunCompletionEvent(walk: WalkResult): {
  eventType: string;
  message: string;
} {
  if (walk.finalStatus === "canceled") {
    return { eventType: "run_canceled", message: "Run canceled" };
  }
  if (walk.finalStatus === "failed") {
    return { eventType: "run_failed", message: "Run failed" };
  }
  if (walk.outcome === "confirmation_timed_out") {
    return {
      eventType: "run_confirmation_timed_out",
      message: "Run completed: confirmation window elapsed",
    };
  }
  return { eventType: "run_completed", message: "Run completed" };
}

export async function executeJourneyRun(
  input: JourneyRunStartInput,
  dependencies: JourneyRunExecutorDependencies,
): Promise<JourneyRunExecutorResult> {
  const { runtime } = dependencies;
  const dispatchDelivery =
    dependencies.dispatchDelivery ?? dispatchForActionType;
  const loadContext =
    dependencies.loadContext ?? loadFreshContextForPlannerByRun;
  const now = dependencies.now ?? (() => new Date());
  const maxDispatchAttempts =
    dependencies.maxDispatchAttempts ?? DEFAULT_MAX_DISPATCH_ATTEMPTS;
  const visitedNodeIds: string[] = [];

  // Step 1 — read the pinned snapshot + current status (memoized for determinism).
  const loaded = await runtime.runStep("load-run", () =>
    loadRunForExecution(input.orgId, input.journeyRunId),
  );

  if (!loaded) {
    return {
      journeyRunId: input.journeyRunId,
      status: "failed",
      outcome: "skipped_not_found",
      visitedNodeIds,
    };
  }

  if (!isActiveRunStatus(loaded.status)) {
    return {
      journeyRunId: input.journeyRunId,
      status: loaded.status,
      outcome: "skipped_terminal",
      visitedNodeIds,
    };
  }

  const graph = parseGraph(loaded.journeyVersionSnapshot);
  if (!graph) {
    await runtime.runStep("invalid-graph", () =>
      finalizeRun({
        orgId: input.orgId,
        runId: input.journeyRunId,
        status: "failed",
        eventType: "run_failed",
        message: "Run failed: pinned graph snapshot is invalid",
      }),
    );
    return {
      journeyRunId: input.journeyRunId,
      status: "failed",
      outcome: "skipped_invalid_graph",
      visitedNodeIds,
    };
  }

  const triggerNode = getTriggerNode(graph);
  if (!triggerNode) {
    await runtime.runStep("invalid-graph", () =>
      finalizeRun({
        orgId: input.orgId,
        runId: input.journeyRunId,
        status: "failed",
        eventType: "run_failed",
        message: "Run failed: graph has no trigger node",
      }),
    );
    return {
      journeyRunId: input.journeyRunId,
      status: "failed",
      outcome: "skipped_invalid_graph",
      visitedNodeIds,
    };
  }

  const nodeById = buildNodeById(graph);
  const outgoingEdgesBySource = buildOutgoingEdgesBySource(graph);
  const startCursor = parseEventTimestamp(input.eventTimestamp, now());

  // Step 2 — transition planned -> running and record the trigger step.
  await runtime.runStep("init-run", () =>
    startRunExecution({
      orgId: input.orgId,
      runId: input.journeyRunId,
      triggerStepKey: triggerNode.attributes.id,
      triggerEventType: input.triggerEventType,
      startedAt: startCursor,
      appointmentId: input.appointmentId,
    }),
  );

  // Step 3 — load the trigger context (memoized).
  const context = await runtime.runStep("load-context", () =>
    loadContext({
      orgId: input.orgId,
      triggerEntityType: input.triggerEntityType,
      triggerEntityId: input.triggerEntityId,
      appointmentId: input.appointmentId,
      clientId: input.clientId,
    }),
  );

  if (!context) {
    await runtime.runStep("missing-context", () =>
      finalizeRun({
        orgId: input.orgId,
        runId: input.journeyRunId,
        status: "canceled",
        eventType: "run_canceled",
        message: "Run canceled: trigger entity no longer exists",
      }),
    );
    return {
      journeyRunId: input.journeyRunId,
      status: "canceled",
      outcome: "skipped_missing_context",
      visitedNodeIds,
    };
  }

  const firstNodes = resolveTriggerNextNodeIds({
    sourceNodeId: triggerNode.attributes.id,
    branch: input.triggerBranch ?? "scheduled",
    outgoingEdgesBySource,
  });

  // Walk the rooted tree, one node at a time, fanning out to all successors in
  // parallel. Recursion (rather than a loop) keeps the per-node sequential awaits
  // out of a loop body. Every node has exactly one incoming edge (the validator
  // forbids joins), so each node is visited once and its node-id step ids stay
  // unique even across parallel branches; the visited set guards against cycles.
  const walkAll = async (
    nodeIds: string[],
    cursor: Date,
    nodeContext: PlannerContext,
  ): Promise<WalkResult> => {
    if (nodeIds.length === 0) {
      return { finalStatus: "completed", outcome: "completed" };
    }
    if (nodeIds.length === 1) {
      return advance(nodeIds[0]!, cursor, nodeContext);
    }
    const results = await Promise.all(
      nodeIds.map((id) => advance(id, cursor, nodeContext)),
    );
    return combineWalkResults(results);
  };

  const advance = async (
    nodeId: string,
    cursor: Date,
    nodeContext: PlannerContext,
  ): Promise<WalkResult> => {
    if (visitedNodeIds.includes(nodeId)) {
      return { finalStatus: "completed", outcome: "completed" };
    }
    visitedNodeIds.push(nodeId);

    const node = nodeById.get(nodeId);
    if (!node) {
      return { finalStatus: "completed", outcome: "completed" };
    }

    const actionType = getNormalizedActionType(node);
    const stepKey = node.attributes.id;
    const label =
      typeof node.attributes.data.label === "string"
        ? node.attributes.data.label
        : "";
    const successors = () => successorsOf(stepKey, outgoingEdgesBySource);
    const reloadContext = () =>
      loadContext({
        orgId: input.orgId,
        triggerEntityType: input.triggerEntityType,
        triggerEntityId: input.triggerEntityId,
        appointmentId: input.appointmentId,
        clientId: input.clientId,
      });

    if (actionType === "wait") {
      const waitUntilIso = await runtime.runStep(`wait-enter:${stepKey}`, () =>
        enterWaitStep({
          orgId: input.orgId,
          runId: input.journeyRunId,
          node,
          stepKey,
          label,
          cursor,
          context: nodeContext,
        }),
      );
      const waitUntil = new Date(waitUntilIso);
      await runtime.sleepUntil(`wait:${stepKey}`, waitUntil);
      await runtime.runStep(`wait-exit:${stepKey}`, () =>
        exitWaitStep({
          orgId: input.orgId,
          runId: input.journeyRunId,
          stepKey,
          startedAt: cursor,
          completedAt: waitUntil,
        }),
      );
      // Reload fresh context after the durable sleep (memoized so replay is stable).
      const reloaded = await runtime.runStep(
        `wait-reload:${stepKey}`,
        reloadContext,
      );
      if (!reloaded) {
        return { finalStatus: "canceled", outcome: "skipped_missing_context" };
      }
      return walkAll(successors(), waitUntil, reloaded);
    }

    if (actionType === "condition") {
      const decision = await runtime.runStep(`condition:${stepKey}`, () =>
        evaluateConditionStep({
          orgId: input.orgId,
          runId: input.journeyRunId,
          node,
          stepKey,
          journeyId: input.journeyId,
          triggerEntityId: input.triggerEntityId,
          outgoingEdgesBySource,
          context: nodeContext,
          now: now(),
          startedAt: cursor,
        }),
      );
      return walkAll(decision.nextNodeIds, cursor, nodeContext);
    }

    if (actionType === "wait-for-confirmation") {
      const graceMinutes = Math.max(
        0,
        Math.floor(
          toNumber(getActionConfig(node)["confirmationGraceMinutes"]) ?? 0,
        ),
      );
      const decision = await runtime.runStep(`wfc-enter:${stepKey}`, () =>
        enterWaitForConfirmationStep({
          orgId: input.orgId,
          runId: input.journeyRunId,
          stepKey,
          label,
          graceMinutes,
          cursor,
          context: nodeContext,
        }),
      );

      if (!decision.waiting) {
        return walkAll(successors(), cursor, nodeContext);
      }

      const confirmation = await runtime.waitForEvent(`confirm:${stepKey}`, {
        event: "appointment.confirmed",
        timeout: new Date(decision.timeoutAt),
        ...(input.appointmentId
          ? {
              ifExpression: `async.data.appointmentId == "${input.appointmentId}"`,
            }
          : {}),
      });

      const confirmed = confirmation != null;
      await runtime.runStep(`wfc-exit:${stepKey}`, () =>
        exitWaitForConfirmationStep({
          orgId: input.orgId,
          runId: input.journeyRunId,
          stepKey,
          startedAt: cursor,
          completedAt: now(),
          confirmed,
        }),
      );

      if (!confirmed) {
        // Today's semantics: a confirmation timeout ends the journey.
        return { finalStatus: "completed", outcome: "confirmation_timed_out" };
      }

      const reloaded = await runtime.runStep(
        `wfc-reload:${stepKey}`,
        reloadContext,
      );
      if (!reloaded) {
        return { finalStatus: "canceled", outcome: "skipped_missing_context" };
      }
      return walkAll(successors(), cursor, reloaded);
    }

    if (actionType && isJourneyDeliveryActionType(actionType)) {
      const channel = resolveChannel(actionType);
      const scheduledFor = new Date(cursor);
      const deterministicKey = `${input.journeyRunId}:${stepKey}`;

      // Three ordered steps so the non-idempotent provider send is isolated:
      // (1) record the delivery row in `planned` (so a status callback always
      // finds a row, and the delivery id is stable across replays), (2) dispatch
      // — the only non-idempotent effect, memoized so a later failure never
      // re-sends, (3) finalize the projection from the memoized send result.
      const journeyDeliveryId = await runtime.runStep(
        `send-prepare:${stepKey}`,
        () =>
          prepareSendStep({
            orgId: input.orgId,
            runId: input.journeyRunId,
            stepKey,
            actionType,
            channel,
            scheduledFor,
            deterministicKey,
          }),
      );
      const sendResult = await runtime.runStep(`send:${stepKey}`, () =>
        dispatchSendOnly({
          orgId: input.orgId,
          runId: input.journeyRunId,
          stepKey,
          actionType,
          channel,
          journeyDeliveryId,
          deterministicKey,
          stepConfig: getActionConfig(node),
          mode: input.mode,
          triggerEntityType: input.triggerEntityType,
          appointmentId: input.appointmentId,
          clientId: input.clientId,
          dispatchDelivery,
          maxDispatchAttempts,
        }),
      );
      await runtime.runStep(`send-finalize:${stepKey}`, () =>
        finalizeSendStep({
          orgId: input.orgId,
          runId: input.journeyRunId,
          stepKey,
          actionType,
          channel,
          deterministicKey,
          scheduledFor,
          result: sendResult,
        }),
      );
      return walkAll(successors(), cursor, nodeContext);
    }

    // Unknown / passthrough node: advance to all successors.
    return walkAll(successors(), cursor, nodeContext);
  };

  const walk = await walkAll(firstNodes, startCursor, context);

  const completion = resolveRunCompletionEvent(walk);
  await runtime.runStep("complete-run", () =>
    finalizeRun({
      orgId: input.orgId,
      runId: input.journeyRunId,
      status: walk.finalStatus,
      eventType: completion.eventType,
      message: completion.message,
    }),
  );

  return {
    journeyRunId: input.journeyRunId,
    status: walk.finalStatus,
    outcome: walk.outcome,
    visitedNodeIds,
  };
}

type LoadedRun = {
  status: "planned" | "running" | "completed" | "canceled" | "failed";
  journeyVersionSnapshot: unknown;
  journeyNameSnapshot: string;
};

async function loadRunForExecution(
  orgId: string,
  runId: string,
): Promise<LoadedRun | null> {
  return withOrg(orgId, async (tx) => {
    const [run] = await tx
      .select({
        status: journeyRuns.status,
        journeyVersionSnapshot: journeyRuns.journeyVersionSnapshot,
        journeyNameSnapshot: journeyRuns.journeyNameSnapshot,
      })
      .from(journeyRuns)
      .where(eq(journeyRuns.id, runId))
      .limit(1);

    return run ?? null;
  });
}

async function startRunExecution(input: {
  orgId: string;
  runId: string;
  triggerStepKey: string;
  triggerEventType: string;
  startedAt: Date;
  appointmentId: string | null;
}): Promise<void> {
  await withOrg(input.orgId, async (tx) => {
    await tx
      .update(journeyRuns)
      .set({ status: "running" })
      .where(
        and(
          eq(journeyRuns.id, input.runId),
          inArray(journeyRuns.status, [...ACTIVE_RUN_STATUSES]),
        ),
      );

    await upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.triggerStepKey,
      nodeType: "trigger",
      status: "success",
      startedAt: input.startedAt,
      completedAt: input.startedAt,
      durationMs: 0,
      logInput: {
        eventType: input.triggerEventType,
        appointmentId: input.appointmentId,
      },
      logOutput: { routed: true },
    });

    await appendJourneyRunEvent({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      eventType: "run_started",
      message: "Run started",
    });
  });
}

async function enterWaitStep(input: {
  orgId: string;
  runId: string;
  node: ActionNode;
  stepKey: string;
  label: string;
  cursor: Date;
  context: PlannerContext;
}): Promise<string> {
  const config = getActionConfig(input.node);
  const waitUntil = resolveWaitCursor({
    node: input.node,
    cursor: input.cursor,
    appointmentContext: input.context.appointmentContext,
    clientContext: input.context.clientContext,
    orgTimezone: input.context.orgTimezone,
  });

  await withOrg(input.orgId, async (tx) => {
    await upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.stepKey,
      nodeType: "wait",
      status: "running",
      startedAt: input.cursor,
      completedAt: null,
      durationMs: null,
      logInput: {
        waitDuration: config["waitDuration"] ?? null,
        waitUntil: config["waitUntil"] ?? null,
        waitOffset: config["waitOffset"] ?? null,
        waitTimezone: config["waitTimezone"] ?? null,
        waitAllowedHoursMode: config["waitAllowedHoursMode"] ?? null,
        waitAllowedStartTime: config["waitAllowedStartTime"] ?? null,
        waitAllowedEndTime: config["waitAllowedEndTime"] ?? null,
        cursor: input.cursor.toISOString(),
      },
      logOutput: { waitUntil: waitUntil.toISOString() },
    });
    await appendJourneyRunEvent({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      eventType: "run_waiting",
      message: `Run waiting in delay node '${input.label || "Wait"}'`,
      metadata: { stepKey: input.stepKey, waitUntil: waitUntil.toISOString() },
    });
  });

  return waitUntil.toISOString();
}

async function exitWaitStep(input: {
  orgId: string;
  runId: string;
  stepKey: string;
  startedAt: Date;
  completedAt: Date;
}): Promise<void> {
  await withOrg(input.orgId, (tx) =>
    upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.stepKey,
      nodeType: "wait",
      status: "success",
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: Math.max(
        0,
        input.completedAt.getTime() - input.startedAt.getTime(),
      ),
      logOutput: { waitUntil: input.completedAt.toISOString() },
    }),
  );
}

async function evaluateConditionStep(input: {
  orgId: string;
  runId: string;
  node: ActionNode;
  stepKey: string;
  journeyId: string;
  triggerEntityId: string;
  outgoingEdgesBySource: ReturnType<typeof buildOutgoingEdgesBySource>;
  context: PlannerContext;
  now: Date;
  startedAt: Date;
}): Promise<{ nextNodeIds: string[] }> {
  const result = resolveConditionNextNodeIdForContext({
    node: input.node,
    outgoingEdgesBySource: input.outgoingEdgesBySource,
    appointmentContext: input.context.appointmentContext,
    clientContext: input.context.clientContext,
    journeyId: input.journeyId,
    triggerEntityId: input.triggerEntityId,
    now: input.now,
    orgTimezone: input.context.orgTimezone,
  });

  await withOrg(input.orgId, (tx) =>
    upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.stepKey,
      nodeType: "condition",
      status: result.error ? "error" : "success",
      startedAt: input.startedAt,
      completedAt: input.startedAt,
      durationMs: 0,
      logInput: { expression: getConditionExpression(input.node) },
      logOutput: { matched: result.matched, nextNodeIds: result.nextNodeIds },
      error: result.error?.message ?? null,
    }),
  );

  return { nextNodeIds: result.nextNodeIds };
}

async function enterWaitForConfirmationStep(input: {
  orgId: string;
  runId: string;
  stepKey: string;
  label: string;
  graceMinutes: number;
  cursor: Date;
  context: PlannerContext;
}): Promise<{ waiting: false } | { waiting: true; timeoutAt: string }> {
  const requiresConfirmation = resolveAppointmentRequiresConfirmation(
    input.context.appointmentContext,
  );
  const appointmentStatus = resolveAppointmentStatus(
    input.context.appointmentContext,
  );
  const alreadyConfirmed = appointmentStatus === "confirmed";

  if (!requiresConfirmation || alreadyConfirmed) {
    await withOrg(input.orgId, (tx) =>
      upsertJourneyRunStepLog({
        tx,
        orgId: input.orgId,
        runId: input.runId,
        stepKey: input.stepKey,
        nodeType: "wait-for-confirmation",
        status: "success",
        startedAt: input.cursor,
        completedAt: input.cursor,
        durationMs: 0,
        logInput: {
          requiresConfirmation,
          appointmentStatus,
          confirmationGraceMinutes: input.graceMinutes,
        },
        logOutput: {
          continued: true,
          reasonCode: !requiresConfirmation
            ? "confirmation_not_required"
            : "already_confirmed",
        },
      }),
    );
    return { waiting: false };
  }

  const timeoutAt = resolveWaitForConfirmationTimeoutAt({
    appointmentContext: input.context.appointmentContext,
    fallback: input.cursor,
    graceMinutes: input.graceMinutes,
  });

  await withOrg(input.orgId, async (tx) => {
    await upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.stepKey,
      nodeType: "wait-for-confirmation",
      status: "running",
      startedAt: input.cursor,
      completedAt: null,
      durationMs: null,
      logInput: {
        requiresConfirmation,
        appointmentStatus,
        confirmationGraceMinutes: input.graceMinutes,
        cursor: input.cursor.toISOString(),
      },
      logOutput: { waitUntil: timeoutAt.toISOString() },
    });
    await appendJourneyRunEvent({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      eventType: "run_waiting_confirmation",
      message: `Run waiting for appointment confirmation in '${input.label || "Wait For Confirmation"}'`,
      metadata: {
        stepKey: input.stepKey,
        waitUntil: timeoutAt.toISOString(),
        confirmationGraceMinutes: input.graceMinutes,
      },
    });
  });

  return { waiting: true, timeoutAt: timeoutAt.toISOString() };
}

async function exitWaitForConfirmationStep(input: {
  orgId: string;
  runId: string;
  stepKey: string;
  startedAt: Date;
  completedAt: Date;
  confirmed: boolean;
}): Promise<void> {
  await withOrg(input.orgId, async (tx) => {
    await upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.stepKey,
      nodeType: "wait-for-confirmation",
      status: "success",
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: Math.max(
        0,
        input.completedAt.getTime() - input.startedAt.getTime(),
      ),
      logOutput: {
        confirmed: input.confirmed,
        reasonCode: input.confirmed ? "appointment_confirmed" : "timeout",
      },
    });
    await appendJourneyRunEvent({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      eventType: input.confirmed
        ? "run_confirmation_received"
        : "run_confirmation_timeout",
      message: input.confirmed
        ? "Appointment confirmed; run resuming"
        : "Confirmation window elapsed",
      metadata: { stepKey: input.stepKey },
    });
  });
}

type SendResult = {
  providerMessageId: string | null;
  reasonCode: string | null;
  awaitingAsyncCallback: boolean;
  attempts: number;
};

// Step 1: record the delivery in `planned` before the send. Insert-or-get so the
// returned id is stable across replays (it is the row's id, the same value the
// provider receives as its callback correlation handle). Also writes a `running`
// step log so the overlay shows the send in progress.
async function prepareSendStep(input: {
  orgId: string;
  runId: string;
  stepKey: string;
  actionType: string;
  channel: string;
  scheduledFor: Date;
  deterministicKey: string;
}): Promise<string> {
  return withOrg(input.orgId, async (tx) => {
    const [inserted] = await tx
      .insert(journeyDeliveries)
      .values({
        orgId: input.orgId,
        journeyRunId: input.runId,
        stepKey: input.stepKey,
        channel: input.channel,
        actionType: input.actionType,
        scheduledFor: input.scheduledFor,
        status: "planned",
        deterministicKey: input.deterministicKey,
      })
      .onConflictDoNothing({
        target: [journeyDeliveries.orgId, journeyDeliveries.deterministicKey],
      })
      .returning({ id: journeyDeliveries.id });

    let deliveryId = inserted?.id;
    if (!deliveryId) {
      const [existing] = await tx
        .select({ id: journeyDeliveries.id })
        .from(journeyDeliveries)
        .where(
          and(
            eq(journeyDeliveries.orgId, input.orgId),
            eq(journeyDeliveries.deterministicKey, input.deterministicKey),
          ),
        )
        .limit(1);
      if (!existing) {
        throw new Error("Delivery row missing after conflict during prepare.");
      }
      deliveryId = existing.id;
    }

    await upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.stepKey,
      nodeType: input.actionType,
      status: "running",
      startedAt: input.scheduledFor,
      completedAt: null,
      durationMs: null,
      logInput: {
        channel: input.channel,
        idempotencyKey: input.deterministicKey,
      },
      logOutput: { status: "planned" },
    });

    return deliveryId;
  });
}

// Step 2: the only non-idempotent effect — dispatch the provider send. Runs in
// its own memoized step, so a successful send is checkpointed and never replays
// when a later step (finalize) fails and Inngest retries the function.
async function dispatchSendOnly(input: {
  orgId: string;
  runId: string;
  stepKey: string;
  actionType: string;
  channel: string;
  journeyDeliveryId: string;
  deterministicKey: string;
  stepConfig: Record<string, unknown>;
  mode: JourneyRunMode;
  triggerEntityType: "appointment" | "client";
  appointmentId: string | null;
  clientId: string | null;
  dispatchDelivery: JourneyDeliveryDispatcher;
  maxDispatchAttempts: number;
}): Promise<SendResult> {
  const dispatchPayload: JourneyDeliveryDispatchInput = {
    orgId: input.orgId,
    journeyDeliveryId: input.journeyDeliveryId,
    journeyRunId: input.runId,
    channel: input.channel,
    idempotencyKey: input.deterministicKey,
    runMode: input.mode,
    stepConfig: input.stepConfig,
    triggerEntityType: input.triggerEntityType,
    ...(input.appointmentId != null
      ? { appointmentId: input.appointmentId }
      : {}),
    ...(input.clientId != null ? { clientId: input.clientId } : {}),
  };

  const maxAttempts =
    getProviderForActionType(input.actionType)?.maxDispatchAttempts ??
    input.maxDispatchAttempts;
  let attempts = 0;
  const dispatched = await retry(
    async () => {
      attempts++;
      return input.dispatchDelivery(dispatchPayload);
    },
    {
      retries: maxAttempts,
      shouldRetry: (error) =>
        !(error instanceof JourneyDeliveryNonRetryableError),
    },
  );

  return {
    providerMessageId:
      typeof dispatched.providerMessageId === "string"
        ? dispatched.providerMessageId
        : null,
    reasonCode: dispatched.reasonCode ?? null,
    awaitingAsyncCallback: dispatched.awaitingAsyncCallback === true,
    attempts,
  };
}

// Step 3: finalize the projection from the memoized send result. Async-callback
// providers (Twilio) leave the row `planned`; the journey-action callback
// function finalizes it by id later. The walk advances regardless.
async function finalizeSendStep(input: {
  orgId: string;
  runId: string;
  stepKey: string;
  actionType: string;
  channel: string;
  deterministicKey: string;
  scheduledFor: Date;
  result: SendResult;
}): Promise<void> {
  const awaitingCallback = input.result.awaitingAsyncCallback;

  await withOrg(input.orgId, async (tx) => {
    await tx
      .update(journeyDeliveries)
      .set({
        status: awaitingCallback ? "planned" : "sent",
        reasonCode: input.result.reasonCode,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(journeyDeliveries.orgId, input.orgId),
          eq(journeyDeliveries.deterministicKey, input.deterministicKey),
        ),
      );

    await upsertJourneyRunStepLog({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      stepKey: input.stepKey,
      nodeType: input.actionType,
      status: awaitingCallback ? "running" : "success",
      startedAt: input.scheduledFor,
      completedAt: awaitingCallback ? null : input.scheduledFor,
      durationMs: awaitingCallback ? null : 0,
      logInput: {
        channel: input.channel,
        idempotencyKey: input.deterministicKey,
      },
      logOutput: {
        status: awaitingCallback ? "planned" : "sent",
        attempts: input.result.attempts,
        reasonCode: input.result.reasonCode,
        providerMessageId: input.result.providerMessageId,
        ...(awaitingCallback
          ? { providerState: "accepted_pending_callback" }
          : {}),
      },
    });

    await appendJourneyRunEvent({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      eventType: awaitingCallback
        ? "delivery_provider_accepted"
        : "delivery_sent",
      message: awaitingCallback
        ? `Delivery ${input.stepKey} accepted by provider; awaiting status callback`
        : `Delivery sent for ${input.stepKey}`,
      metadata: {
        stepKey: input.stepKey,
        channel: input.channel,
        ...(input.result.providerMessageId
          ? { providerMessageId: input.result.providerMessageId }
          : {}),
      },
    });
  });
}

async function finalizeRun(input: {
  orgId: string;
  runId: string;
  status: "completed" | "canceled" | "failed";
  eventType: string;
  message: string;
}): Promise<void> {
  await withOrg(input.orgId, async (tx) => {
    await tx
      .update(journeyRuns)
      .set({
        status: input.status,
        ...(input.status === "completed"
          ? { completedAt: sql`now()` }
          : { cancelledAt: sql`now()` }),
      })
      .where(
        and(
          eq(journeyRuns.id, input.runId),
          inArray(journeyRuns.status, [...ACTIVE_RUN_STATUSES]),
        ),
      );

    await appendJourneyRunEvent({
      tx,
      orgId: input.orgId,
      runId: input.runId,
      eventType: input.eventType,
      message: input.message,
    });
  });
}

// Called from the Inngest function's onFailure (retries exhausted) so a run whose
// walk threw past its retries is recorded `failed` in the projection the overlay
// reads, rather than left stuck `running`. Guarded to active runs, so it never
// overrides a run already completed/canceled.
export async function markJourneyRunFailed(
  orgId: string,
  runId: string,
): Promise<void> {
  await finalizeRun({
    orgId,
    runId,
    status: "failed",
    eventType: "run_failed",
    message: "Run failed after exhausting retries",
  });
}
