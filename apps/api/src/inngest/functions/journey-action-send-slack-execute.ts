import { executeJourneyDeliveryScheduled } from "../../services/journey-delivery-worker.js";
import { dispatchJourneySendSlackAction } from "../../services/journey-integration-action-dispatchers.js";
import { inngest } from "../client.js";

type ExecuteJourneyDeliveryScheduled = typeof executeJourneyDeliveryScheduled;
type DispatchJourneySendSlackAction = typeof dispatchJourneySendSlackAction;
const SLACK_ACTION_CONCURRENCY_LIMIT = 10;

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
      concurrency: {
        key: "event.data.orgId",
        // Keep aggregate org-level delivery execution close to the previous
        // single-function budget after splitting provider action executors.
        limit: SLACK_ACTION_CONCURRENCY_LIMIT,
      },
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
