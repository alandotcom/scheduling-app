import {
  linearJourneyGraphSchema,
  type JourneyRunMode,
  type LinearJourneyGraph,
  type TriggerBranch,
} from "@scheduling/dto";
import { toRecord } from "../../lib/type-guards.js";
import { type JourneyDeliveryDispatcher } from "./delivery-dispatch-helpers.js";
import { dispatchForActionType } from "./delivery-provider-registry.js";
import {
  buildNodeById,
  buildOutgoingEdgesBySource,
  getActionConfig,
  getNormalizedActionType,
  getTriggerNode,
  isJourneyDeliveryActionType,
  resolveChannel,
  resolveDefaultNextNodeIds,
  resolveTriggerNextNodeIds,
  toNumber,
  type JourneyEdge,
} from "./journey-graph-walk.js";
import { loadFreshContextForPlannerByRun } from "./journey-template-context.js";
import {
  ACTIVE_RUN_STATUSES,
  dispatchSendOnly,
  enterWaitForConfirmationStep,
  enterWaitStep,
  evaluateConditionStep,
  exitWaitForConfirmationStep,
  exitWaitStep,
  finalizeRun,
  finalizeSendStep,
  loadRunForExecution,
  prepareSendStep,
  startRunExecution,
  type PlannerContext,
} from "./journey-run-steps.js";

export { markJourneyRunFailed } from "./journey-run-steps.js";

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
