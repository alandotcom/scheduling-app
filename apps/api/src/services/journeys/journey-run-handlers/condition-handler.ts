import { withOrg } from "../../../lib/db.js";
import {
  getConditionExpression,
  resolveConditionNextNodeIdForContext,
} from "../journey-graph-walk.js";
import { upsertJourneyRunStepLog } from "../journey-run-artifacts.js";
import type {
  NodeExecutionContext,
  NodeHandlerResult,
} from "./handler-types.js";

// The condition node handler. Evaluates the condition expression against the
// current context, writes the step-log projection, and routes to the matched
// branch's next nodes. One memoized durable step; the matched/error detail is
// projected, the next node ids drive the walk.
export async function conditionHandler(
  ctx: NodeExecutionContext,
): Promise<NodeHandlerResult> {
  const decision = await ctx.runtime.runStep(
    `condition:${ctx.stepKey}`,
    async () => {
      const result = resolveConditionNextNodeIdForContext({
        node: ctx.node,
        outgoingEdgesBySource: ctx.nav.outgoingEdgesBySource,
        appointmentContext: ctx.nodeContext.appointmentContext,
        clientContext: ctx.nodeContext.clientContext,
        journeyId: ctx.identity.journeyId,
        triggerEntityId: ctx.identity.triggerEntityId,
        now: ctx.deps.now(),
        orgTimezone: ctx.nodeContext.orgTimezone,
      });

      await withOrg(ctx.identity.orgId, (tx) =>
        upsertJourneyRunStepLog({
          tx,
          orgId: ctx.identity.orgId,
          runId: ctx.identity.journeyRunId,
          stepKey: ctx.stepKey,
          nodeType: "condition",
          status: result.error ? "error" : "success",
          startedAt: ctx.cursor,
          completedAt: ctx.cursor,
          durationMs: 0,
          logInput: { expression: getConditionExpression(ctx.node) },
          logOutput: {
            matched: result.matched,
            nextNodeIds: result.nextNodeIds,
          },
          error: result.error?.message ?? null,
        }),
      );

      return { nextNodeIds: result.nextNodeIds };
    },
  );

  return {
    kind: "advance",
    nextNodeIds: decision.nextNodeIds,
    cursor: ctx.cursor,
    context: ctx.nodeContext,
  };
}
