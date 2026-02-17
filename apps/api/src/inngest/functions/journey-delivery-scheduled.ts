import { executeJourneyDeliveryScheduled } from "../../services/journey-delivery-worker.js";
import { inngest } from "../client.js";
import { JOURNEY_DELIVERY_FLOW_CONTROL } from "./journey-delivery-flow-control.js";

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
      concurrency: [
        // Shared org-level budget across all journey delivery executors.
        JOURNEY_DELIVERY_FLOW_CONTROL.sharedOrgConcurrency,
        // Logger/local scheduled executor retains its own per-function ceiling.
        JOURNEY_DELIVERY_FLOW_CONTROL.loggerPerFunctionOrgConcurrency,
      ],
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
