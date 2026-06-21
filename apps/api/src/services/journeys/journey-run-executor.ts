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
  getNormalizedActionType,
  getTriggerNode,
  resolveDefaultNextNodeIds,
  resolveTriggerNextNodeIds,
  type JourneyEdge,
} from "./journey-graph-walk.js";
import { resolveNodeHandler } from "./journey-run-handlers/index.js";
import type {
  JourneyRunHandlerDeps,
  JourneyRunIdentity,
} from "./journey-run-handlers/index.js";
import { loadFreshContextForPlannerByRun } from "./journey-template-context.js";
import {
  ACTIVE_RUN_STATUSES,
  finalizeRun,
  loadRunForExecution,
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

export type WalkResult = {
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

  // Per-run facts and injected effects, built once and handed to every node
  // handler via its NodeExecutionContext.
  const identity: JourneyRunIdentity = {
    orgId: input.orgId,
    journeyRunId: input.journeyRunId,
    journeyId: input.journeyId,
    triggerEntityType: input.triggerEntityType,
    triggerEntityId: input.triggerEntityId,
    appointmentId: input.appointmentId,
    clientId: input.clientId,
    mode: input.mode,
    triggerEventType: input.triggerEventType,
  };
  const deps: JourneyRunHandlerDeps = {
    dispatchDelivery,
    loadContext,
    now,
    maxDispatchAttempts,
  };

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

    const handler = resolveNodeHandler(actionType);
    if (!handler) {
      // Unknown / passthrough node: advance to all successors.
      return walkAll(successors(), cursor, nodeContext);
    }

    const result = await handler({
      runtime,
      node,
      actionType: actionType ?? "",
      stepKey,
      label,
      cursor,
      nodeContext,
      identity,
      deps,
      nav: { outgoingEdgesBySource, successors },
    });

    return result.kind === "terminate"
      ? result.result
      : walkAll(result.nextNodeIds, result.cursor, result.context);
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
