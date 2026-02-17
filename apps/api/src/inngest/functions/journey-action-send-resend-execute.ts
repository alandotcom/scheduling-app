import { executeJourneyDeliveryScheduled } from "../../services/journey-delivery-worker.js";
import { dispatchJourneySendResendAction } from "../../services/journey-integration-action-dispatchers.js";
import { inngest } from "../client.js";
import { JOURNEY_DELIVERY_FLOW_CONTROL } from "./journey-delivery-flow-control.js";

type ExecuteJourneyDeliveryScheduled = typeof executeJourneyDeliveryScheduled;
type DispatchJourneySendResendAction = typeof dispatchJourneySendResendAction;

export function createJourneyActionSendResendExecuteFunction(
  executeDelivery: ExecuteJourneyDeliveryScheduled = executeJourneyDeliveryScheduled,
  dispatchDelivery: DispatchJourneySendResendAction = dispatchJourneySendResendAction,
) {
  return inngest.createFunction(
    {
      id: "journey-action-send-resend-execute",
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
        JOURNEY_DELIVERY_FLOW_CONTROL.resendPerFunctionOrgConcurrency,
      ],
    },
    { event: "journey.action.send-resend.execute" },
    // TODO(integrations-webhooks): wait for delivery-confirmed provider events
    // after integration-owned webhook registration/callback routes are added.
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

export const journeyActionSendResendExecuteFunction =
  createJourneyActionSendResendExecuteFunction();
