import { parse, stringify } from "superjson";
import {
  executeJourneyRun,
  markJourneyRunFailed,
  type JourneyRunStartInput,
  type JourneyRunStepRuntime,
} from "../../services/journeys/journey-run-executor.js";
import { toRecord } from "../../lib/type-guards.js";
import { inngest, journeyRunStartEvent } from "../client.js";

type ExecuteJourneyRun = typeof executeJourneyRun;

export function createJourneyRunFunction(
  runExecutor: ExecuteJourneyRun = executeJourneyRun,
) {
  return inngest.createFunction(
    {
      id: "journey-run",
      retries: 3,
      // One run per run row. Composes with the stable run-start event id and the
      // DB identity index; a redelivered start event no-ops.
      idempotency: "event.data.journeyRunId",
      // `event` is the run-start trigger, `async` is the incoming event. Cancel
      // the in-flight run when the appointment is canceled/rescheduled (the
      // dispatcher records the DB cancellation and, for reschedule, starts a
      // fresh run) or when a run is canceled directly (admin/manual). Each
      // predicate also scopes by orgId so tenant isolation is structural.
      cancelOn: [
        {
          event: "appointment.canceled",
          if: "async.data.orgId == event.data.orgId && async.data.appointmentId == event.data.appointmentId",
        },
        {
          event: "appointment.rescheduled",
          if: "async.data.orgId == event.data.orgId && async.data.appointmentId == event.data.appointmentId",
        },
        {
          event: "journey.run.cancel",
          if: "async.data.orgId == event.data.orgId && async.data.journeyRunId == event.data.journeyRunId",
        },
      ],
      concurrency: { key: "event.data.orgId", limit: 50 },
      // Retries exhausted: record the run `failed` in the projection the overlay
      // reads, rather than leaving it stuck `running`.
      onFailure: async ({ event }) => {
        const original = toRecord(toRecord(event.data)["event"]);
        const data = toRecord(original["data"]);
        const orgId = data["orgId"];
        const runId = data["journeyRunId"];
        if (typeof orgId === "string" && typeof runId === "string") {
          await markJourneyRunFailed(orgId, runId);
        }
      },
      triggers: [journeyRunStartEvent],
    },
    async ({ event, step }) => {
      const data = event.data;

      const runtime: JourneyRunStepRuntime = {
        // Memoized durable step: a successful step is checkpointed and its side
        // effects never replay. superjson round-trips so Dates/records survive.
        runStep: async <T>(
          stepId: string,
          fn: () => Promise<T>,
        ): Promise<T> => {
          const serialized = await step.run(stepId, async () =>
            stringify(await fn()),
          );
          return parse<T>(serialized);
        },
        sleepUntil: async (stepId, at) => {
          await step.sleepUntil(stepId, at);
        },
        waitForEvent: async (stepId, options) => {
          const matched = await step.waitForEvent(stepId, {
            event: options.event,
            timeout: options.timeout,
            ...(options.ifExpression ? { if: options.ifExpression } : {}),
          });
          if (!matched) {
            return null;
          }
          return { name: options.event, data: toRecord(matched.data) };
        },
      };

      const runInput: JourneyRunStartInput = {
        orgId: data.orgId,
        journeyRunId: data.journeyRunId,
        journeyId: data.journeyId,
        journeyVersionId: data.journeyVersionId,
        triggerEntityType: data.triggerEntityType,
        triggerEntityId: data.triggerEntityId,
        appointmentId: data.appointmentId,
        clientId: data.clientId,
        mode: data.mode,
        ...(data.triggerBranch ? { triggerBranch: data.triggerBranch } : {}),
        triggerEventType: data.triggerEventType,
        eventTimestamp: data.eventTimestamp,
      };

      return runExecutor(runInput, { runtime });
    },
  );
}

export const journeyRunFunction = createJourneyRunFunction();
