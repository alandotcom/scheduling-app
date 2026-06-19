import {
  applyTwilioStatusCallback,
  type TwilioStatusCallbackApplyResult,
} from "../../services/integrations/twilio/callbacks.js";
import {
  SHARED_ORG_CONCURRENCY,
  TWILIO_CALLBACK_ORG_CONCURRENCY,
} from "../../services/delivery-provider-registry.js";
import { inngest, twilioCallbackReceivedEvent } from "../client.js";

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
      triggers: [twilioCallbackReceivedEvent],
    },
    // event.data is validated against the Zod trigger schema. errorCode is only
    // forwarded when present so the object matches the consumer's exact-optional
    // `errorCode?: string | null` (Zod widens optionals with `undefined`).
    async ({ event }) =>
      applyCallback({
        orgId: event.data.orgId,
        journeyDeliveryId: event.data.journeyDeliveryId,
        messageSid: event.data.messageSid,
        messageStatus: event.data.messageStatus,
        ...(event.data.errorCode !== undefined
          ? { errorCode: event.data.errorCode }
          : {}),
      }),
  );
}

export const journeyActionSendTwilioCallbackReceivedFunction =
  createJourneyActionSendTwilioCallbackReceivedFunction();
