import superjson from "superjson";
import { executeJourneyDeliveryScheduled } from "../../services/journey-delivery-worker.js";
import {
  deliveryProviders,
  SHARED_ORG_CONCURRENCY,
  type DeliveryProviderSpec,
} from "../../services/delivery-provider-registry.js";
import { deliveryEvents, inngest } from "../client.js";

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
      triggers: [deliveryEvents[provider.eventName]],
    },
    async ({ event, step }) =>
      executeDelivery(event["data"], {
        maxDispatchAttempts: provider.maxDispatchAttempts,
        runtime: {
          runStep: async <T>(_stepId: string, fn: () => Promise<T>) => fn(),
          // The provider send runs in a real Inngest step so a successful send
          // is checkpointed and not replayed on retry. superjson round-trips the
          // step result so non-JSON values (e.g. Dates) survive memoization.
          runMemoizedStep: async <T>(
            stepId: string,
            fn: () => Promise<T>,
          ): Promise<T> => {
            const serialized = await step.run(stepId, async () =>
              superjson.stringify(await fn()),
            );
            return superjson.parse<T>(serialized);
          },
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
