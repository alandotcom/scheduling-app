import {
  applyTwilioStatusCallback,
  type TwilioStatusCallbackApplyResult,
} from "../../services/integrations/twilio/callbacks.js";
import {
  SHARED_ORG_CONCURRENCY,
  TWILIO_CALLBACK_ORG_CONCURRENCY,
} from "../../services/delivery-provider-registry.js";
import { inngest } from "../client.js";

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
      concurrency: [SHARED_ORG_CONCURRENCY, TWILIO_CALLBACK_ORG_CONCURRENCY],
    },
    { event: "journey.action.send-twilio.callback-received" },
    async ({ event }) => applyCallback(event.data),
  );
}

export const journeyActionSendTwilioCallbackReceivedFunction =
  createJourneyActionSendTwilioCallbackReceivedFunction();
