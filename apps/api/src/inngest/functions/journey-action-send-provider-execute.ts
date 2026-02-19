import { executeJourneyDeliveryScheduled } from "../../services/journey-delivery-worker.js";
import {
  deliveryProviders,
  type DeliveryProviderSpec,
} from "../../services/delivery-provider-registry.js";
import { inngest } from "../client.js";
import { JOURNEY_DELIVERY_FLOW_CONTROL } from "./journey-delivery-flow-control.js";

type ExecuteJourneyDeliveryScheduled = typeof executeJourneyDeliveryScheduled;

function createProviderExecuteFunction(
  provider: DeliveryProviderSpec,
  executeDelivery: ExecuteJourneyDeliveryScheduled = executeJourneyDeliveryScheduled,
) {
  return inngest.createFunction(
    {
      id: provider.functionId,
      retries: provider.retries as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
      cancelOn: [
        {
          event: "journey.delivery.canceled",
          if: "async.data.journeyDeliveryId == event.data.journeyDeliveryId",
        },
      ],
      concurrency: [
        JOURNEY_DELIVERY_FLOW_CONTROL.sharedOrgConcurrency,
        provider.perFunctionConcurrency,
      ],
    },
    { event: provider.eventName as any },
    async ({ event, step }) =>
      executeDelivery(event["data"], {
        maxDispatchAttempts: provider.maxDispatchAttempts,
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

const executeProviders = deliveryProviders.filter((p) => p.key !== "logger");

export const journeyActionSendProviderExecuteFunctions = executeProviders.map(
  (provider) => createProviderExecuteFunction(provider),
);
