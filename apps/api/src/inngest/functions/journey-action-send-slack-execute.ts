import { executeJourneyDeliveryScheduled } from "../../services/journey-delivery-worker.js";
import { dispatchJourneySendSlackAction } from "../../services/journey-integration-action-dispatchers.js";
import { inngest } from "../client.js";
import { JOURNEY_DELIVERY_FLOW_CONTROL } from "./journey-delivery-flow-control.js";

type ExecuteJourneyDeliveryScheduled = typeof executeJourneyDeliveryScheduled;
type DispatchJourneySendSlackAction = typeof dispatchJourneySendSlackAction;

export function createJourneyActionSendSlackExecuteFunction(
  executeDelivery: ExecuteJourneyDeliveryScheduled = executeJourneyDeliveryScheduled,
  dispatchDelivery: DispatchJourneySendSlackAction = dispatchJourneySendSlackAction,
) {
  return inngest.createFunction(
    {
      id: "journey-action-send-slack-execute",
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
        // Provider-local per-org guardrail to prevent one function from monopolizing
        // the shared budget.
        JOURNEY_DELIVERY_FLOW_CONTROL.slackPerFunctionOrgConcurrency,
      ],
    },
    { event: "journey.action.send-slack.execute" },
    // TODO(integrations-webhooks): add provider callback lifecycle once
    // integration webhook setup/registration is available.
    async ({ event, step }) =>
      executeDelivery(event.data, {
        dispatchDelivery,
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

export const journeyActionSendSlackExecuteFunction =
  createJourneyActionSendSlackExecuteFunction();
