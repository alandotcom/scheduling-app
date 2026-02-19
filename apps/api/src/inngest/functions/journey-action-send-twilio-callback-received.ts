import {
  applyTwilioStatusCallback,
  type TwilioStatusCallbackApplyResult,
} from "../../services/integrations/twilio/callbacks.js";
import { inngest } from "../client.js";
import { JOURNEY_DELIVERY_FLOW_CONTROL } from "./journey-delivery-flow-control.js";

type ApplyTwilioStatusCallback = (
  input: Parameters<typeof applyTwilioStatusCallback>[0],
) => Promise<TwilioStatusCallbackApplyResult>;

export function createJourneyActionSendTwilioCallbackReceivedFunction(
  applyCallback: ApplyTwilioStatusCallback = applyTwilioStatusCallback,
) {
  return inngest.createFunction(
    {
      id: "journey-action-send-twilio-callback-received",
      retries: 2,
      concurrency: [
        JOURNEY_DELIVERY_FLOW_CONTROL.sharedOrgConcurrency,
        JOURNEY_DELIVERY_FLOW_CONTROL.twilioCallbackPerFunctionOrgConcurrency,
      ],
    },
    { event: "journey.action.send-twilio.callback-received" },
    async ({ event }) => applyCallback(event.data),
  );
}

export const journeyActionSendTwilioCallbackReceivedFunction =
  createJourneyActionSendTwilioCallbackReceivedFunction();
