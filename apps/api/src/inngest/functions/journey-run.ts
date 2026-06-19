import superjson from "superjson";
import {
  executeJourneyRun,
  type JourneyRunStartInput,
  type JourneyRunStepRuntime,
} from "../../services/journey-run-executor.js";
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
      // the in-flight run when the appointment is canceled or rescheduled; the
      // dispatcher records the DB cancellation and (for reschedule) starts a
      // fresh run.
      cancelOn: [
        {
          event: "appointment.canceled",
          if: "async.data.appointmentId == event.data.appointmentId",
        },
        {
          event: "appointment.rescheduled",
          if: "async.data.appointmentId == event.data.appointmentId",
        },
      ],
      concurrency: { key: "event.data.orgId", limit: 50 },
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
            superjson.stringify(await fn()),
          );
          return superjson.parse<T>(serialized);
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
