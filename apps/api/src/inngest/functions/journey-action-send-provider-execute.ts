import { executeJourneyDeliveryScheduled } from "../../services/journey-delivery-worker.js";
import {
  deliveryProviders,
  SHARED_ORG_CONCURRENCY,
  type DeliveryProviderSpec,
} from "../../services/delivery-provider-registry.js";
import { inngest } from "../client.js";

type ExecuteJourneyDeliveryScheduled = typeof executeJourneyDeliveryScheduled;

function createProviderExecuteFunction(
  provider: DeliveryProviderSpec,
  executeDelivery: ExecuteJourneyDeliveryScheduled = executeJourneyDeliveryScheduled,
) {
  return inngest.createFunction(
    {
      id: provider.functionId,
      retries: provider.retries,
      cancelOn: [
        {
          event: "journey.delivery.canceled",
          if: "async.data.journeyDeliveryId == event.data.journeyDeliveryId",
        },
      ],
      concurrency: [SHARED_ORG_CONCURRENCY, provider.perFunctionConcurrency],
    },
    { event: provider.eventName },
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

export const journeyActionSendProviderExecuteFunctions = deliveryProviders.map(
  (provider) => createProviderExecuteFunction(provider),
);
