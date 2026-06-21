import type { JourneyRunMode } from "@scheduling/dto";
import type { JourneyDeliveryDispatcher } from "../delivery-dispatch-helpers.js";
import type { ActionNode, JourneyEdge } from "../journey-graph-walk.js";
import type {
  JourneyRunStepRuntime,
  WalkResult,
} from "../journey-run-executor.js";
import type { PlannerContext } from "../journey-run-steps.js";
import type { loadFreshContextForPlannerByRun } from "../journey-template-context.js";

// The node-execution seam. The executor walks the pinned graph and delegates each
// node to its node handler; the handler owns that node type's full lifecycle (its
// durable-step sequence, its projection writes, its config resolution, and — for
// wait / wait-for-confirmation — its own context reload after a durable suspend),
// returning either `advance` (route onward) or `terminate` (end the walk).
//
// `NodeExecutionContext` and `NodeHandlerResult` are plain in-memory values
// exchanged between executor and handler. They NEVER cross a durable `runStep`
// boundary; only the small per-step values inside a handler do.

// Immutable per-run facts, derived once from the run start input.
export type JourneyRunIdentity = {
  orgId: string;
  journeyRunId: string;
  journeyId: string;
  triggerEntityType: "appointment" | "client";
  triggerEntityId: string;
  appointmentId: string | null;
  clientId: string | null;
  mode: JourneyRunMode;
  triggerEventType: string;
};

// Injected effects, shared by every node handler.
export type JourneyRunHandlerDeps = {
  dispatchDelivery: JourneyDeliveryDispatcher;
  loadContext: typeof loadFreshContextForPlannerByRun;
  now: () => Date;
  maxDispatchAttempts: number;
};

// Graph navigation scoped to one node visit.
export type JourneyRunGraphNav = {
  outgoingEdgesBySource: Map<string, JourneyEdge[]>;
  successors: () => string[];
};

export type NodeExecutionContext = {
  runtime: JourneyRunStepRuntime;
  node: ActionNode;
  actionType: string;
  stepKey: string;
  label: string;
  cursor: Date;
  nodeContext: PlannerContext;
  identity: JourneyRunIdentity;
  deps: JourneyRunHandlerDeps;
  nav: JourneyRunGraphNav;
};

export type NodeHandlerResult =
  | {
      kind: "advance";
      nextNodeIds: string[];
      cursor: Date;
      context: PlannerContext;
    }
  | { kind: "terminate"; result: WalkResult };

export type NodeHandler = (
  ctx: NodeExecutionContext,
) => Promise<NodeHandlerResult>;
