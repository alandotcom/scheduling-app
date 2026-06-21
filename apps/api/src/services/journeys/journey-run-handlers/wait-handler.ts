import { withOrg } from "../../../lib/db.js";
import {
  getActionConfig,
  resolveWaitCursor,
  type ActionNode,
} from "../journey-graph-walk.js";
import {
  appendJourneyRunEvent,
  upsertJourneyRunStepLog,
} from "../journey-run-artifacts.js";
import type { PlannerContext } from "../journey-run-steps.js";
import type {
  NodeExecutionContext,
  NodeHandlerResult,
} from "./handler-types.js";

// The wait node handler. Enter records the computed wait-until and a `running`
// projection, the runtime sleeps until that instant, exit records `success`, then
// the handler reloads fresh context (the world may have changed across the durable
// sleep) and advances with the new cursor and context. A vanished trigger entity
// after reload terminates the run canceled.

async function enterWait(input: {
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

async function exitWait(input: {
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

export async function waitHandler(
  ctx: NodeExecutionContext,
): Promise<NodeHandlerResult> {
  const waitUntilIso = await ctx.runtime.runStep(
    `wait-enter:${ctx.stepKey}`,
    () =>
      enterWait({
        orgId: ctx.identity.orgId,
        runId: ctx.identity.journeyRunId,
        node: ctx.node,
        stepKey: ctx.stepKey,
        label: ctx.label,
        cursor: ctx.cursor,
        context: ctx.nodeContext,
      }),
  );
  const waitUntil = new Date(waitUntilIso);
  await ctx.runtime.sleepUntil(`wait:${ctx.stepKey}`, waitUntil);
  await ctx.runtime.runStep(`wait-exit:${ctx.stepKey}`, () =>
    exitWait({
      orgId: ctx.identity.orgId,
      runId: ctx.identity.journeyRunId,
      stepKey: ctx.stepKey,
      startedAt: ctx.cursor,
      completedAt: waitUntil,
    }),
  );

  // Reload fresh context after the durable sleep (memoized so replay is stable).
  const reloaded = await ctx.runtime.runStep(`wait-reload:${ctx.stepKey}`, () =>
    ctx.deps.loadContext({
      orgId: ctx.identity.orgId,
      triggerEntityType: ctx.identity.triggerEntityType,
      triggerEntityId: ctx.identity.triggerEntityId,
      appointmentId: ctx.identity.appointmentId,
      clientId: ctx.identity.clientId,
    }),
  );
  if (!reloaded) {
    return {
      kind: "terminate",
      result: { finalStatus: "canceled", outcome: "skipped_missing_context" },
    };
  }
  return {
    kind: "advance",
    nextNodeIds: ctx.nav.successors(),
    cursor: waitUntil,
    context: reloaded,
  };
}
