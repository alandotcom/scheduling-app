import { executeJourneyDeliveryScheduled } from "../../services/journey-delivery-worker.js";
import { dispatchJourneySendResendAction } from "../../services/journey-integration-action-dispatchers.js";
import { inngest } from "../client.js";

type ExecuteJourneyDeliveryScheduled = typeof executeJourneyDeliveryScheduled;
type DispatchJourneySendResendAction = typeof dispatchJourneySendResendAction;
const RESEND_ACTION_CONCURRENCY_LIMIT = 10;

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
      concurrency: {
        key: "event.data.orgId",
        // Keep aggregate org-level delivery execution close to the previous
        // single-function budget after splitting provider action executors.
        limit: RESEND_ACTION_CONCURRENCY_LIMIT,
      },
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
