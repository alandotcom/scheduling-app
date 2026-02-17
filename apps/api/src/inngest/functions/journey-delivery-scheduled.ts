import { executeJourneyDeliveryScheduled } from "../../services/journey-delivery-worker.js";
import { inngest } from "../client.js";

type ExecuteJourneyDeliveryScheduled = typeof executeJourneyDeliveryScheduled;

export function createJourneyDeliveryScheduledFunction(
  executeDelivery: ExecuteJourneyDeliveryScheduled = executeJourneyDeliveryScheduled,
) {
  return inngest.createFunction(
    {
      id: "journey-delivery-scheduled",
      retries: 2,
      cancelOn: [
        {
          event: "journey.delivery.canceled",
          if: "async.data.journeyDeliveryId == event.data.journeyDeliveryId",
        },
      ],
      concurrency: {
        key: "event.data.orgId",
        limit: 20,
      },
    },
    { event: "journey.delivery.scheduled" },
    async ({ event, step }) =>
      executeDelivery(event.data, {
        runtime: {
          runStep: async <T>(_stepId: string, fn: () => Promise<T>) => fn(),
          sleep: async (stepId, delayMs) => {
            if (delayMs <= 0) {
              return;
            }

            await step.sleep(stepId, Math.ceil(delayMs));
          },
        },
      }),
  );
}

export const journeyDeliveryScheduledFunction =
  createJourneyDeliveryScheduledFunction();
