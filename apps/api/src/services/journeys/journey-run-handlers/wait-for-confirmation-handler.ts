import { withOrg } from "../../../lib/db.js";
import {
  getActionConfig,
  resolveAppointmentRequiresConfirmation,
  resolveAppointmentStatus,
  resolveWaitForConfirmationTimeoutAt,
  toNumber,
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

// The wait-for-confirmation node handler. Enter decides whether the run must wait
// (confirmation required and not already confirmed); if not, it advances. When
// waiting, the runtime waits for `appointment.confirmed` until the timeout, exit
// records the outcome, and a timeout ends the journey (today's semantics) while a
// confirmation reloads fresh context and advances.

async function enterWaitForConfirmation(input: {
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

async function exitWaitForConfirmation(input: {
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

export async function waitForConfirmationHandler(
  ctx: NodeExecutionContext,
): Promise<NodeHandlerResult> {
  const graceMinutes = Math.max(
    0,
    Math.floor(
      toNumber(getActionConfig(ctx.node)["confirmationGraceMinutes"]) ?? 0,
    ),
  );
  const decision = await ctx.runtime.runStep(`wfc-enter:${ctx.stepKey}`, () =>
    enterWaitForConfirmation({
      orgId: ctx.identity.orgId,
      runId: ctx.identity.journeyRunId,
      stepKey: ctx.stepKey,
      label: ctx.label,
      graceMinutes,
      cursor: ctx.cursor,
      context: ctx.nodeContext,
    }),
  );

  if (!decision.waiting) {
    return {
      kind: "advance",
      nextNodeIds: ctx.nav.successors(),
      cursor: ctx.cursor,
      context: ctx.nodeContext,
    };
  }

  const confirmation = await ctx.runtime.waitForEvent(
    `confirm:${ctx.stepKey}`,
    {
      event: "appointment.confirmed",
      timeout: new Date(decision.timeoutAt),
      ...(ctx.identity.appointmentId
        ? {
            ifExpression: `async.data.appointmentId == "${ctx.identity.appointmentId}"`,
          }
        : {}),
    },
  );

  const confirmed = confirmation != null;
  await ctx.runtime.runStep(`wfc-exit:${ctx.stepKey}`, () =>
    exitWaitForConfirmation({
      orgId: ctx.identity.orgId,
      runId: ctx.identity.journeyRunId,
      stepKey: ctx.stepKey,
      startedAt: ctx.cursor,
      completedAt: ctx.deps.now(),
      confirmed,
    }),
  );

  if (!confirmed) {
    // Today's semantics: a confirmation timeout ends the journey.
    return {
      kind: "terminate",
      result: { finalStatus: "completed", outcome: "confirmation_timed_out" },
    };
  }

  const reloaded = await ctx.runtime.runStep(`wfc-reload:${ctx.stepKey}`, () =>
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
    cursor: ctx.cursor,
    context: reloaded,
  };
}
