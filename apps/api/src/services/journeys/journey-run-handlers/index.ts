import { isJourneyDeliveryActionType } from "../journey-graph-walk.js";
import { conditionHandler } from "./condition-handler.js";
import { sendHandler } from "./send-handler.js";
import { waitForConfirmationHandler } from "./wait-for-confirmation-handler.js";
import { waitHandler } from "./wait-handler.js";
import type { NodeHandler } from "./handler-types.js";

export type {
  JourneyRunIdentity,
  JourneyRunHandlerDeps,
  JourneyRunGraphNav,
  NodeExecutionContext,
  NodeHandler,
  NodeHandlerResult,
} from "./handler-types.js";

// Resolve the handler for a node's action type. Precedence mirrors the original
// executor branch order; an unrecognized action type returns null (the executor
// treats it as a passthrough and advances to successors).
export function resolveNodeHandler(
  actionType: string | null,
): NodeHandler | null {
  if (actionType === "wait") {
    return waitHandler;
  }
  if (actionType === "condition") {
    return conditionHandler;
  }
  if (actionType === "wait-for-confirmation") {
    return waitForConfirmationHandler;
  }
  if (actionType && isJourneyDeliveryActionType(actionType)) {
    return sendHandler;
  }
  return null;
}
