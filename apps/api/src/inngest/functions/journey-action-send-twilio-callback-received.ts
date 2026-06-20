import {
  mapTwilioStatusCallback,
  type TwilioStatusCallbackPayload,
} from "../../services/integrations/twilio/callbacks.js";
import {
  recordDeliveryOutcome,
  type DeliveryOutcomeResult,
} from "../../services/journeys/journey-delivery-outcome.js";
import { inngest, twilioCallbackReceivedEvent } from "../client.js";

// Concurrency limits for the Twilio status-callback function: a shared
// env-wide cap across journey-delivery work plus a per-function org cap.
const SHARED_ORG_CONCURRENCY = {
  key: '"journey-delivery:" + event.data.orgId',
  scope: "env",
  limit: 20,
} as const;

const TWILIO_CALLBACK_ORG_CONCURRENCY = {
  key: "event.data.orgId",
  scope: "fn",
  limit: 10,
} as const;

type ApplyTwilioStatusCallback = (
  payload: TwilioStatusCallbackPayload,
) => Promise<DeliveryOutcomeResult>;

// Composition: map the Twilio status (integration) into a channel-neutral
// outcome, then record it on the run projection (journey domain).
export async function applyTwilioStatusCallback(
  payload: TwilioStatusCallbackPayload,
): Promise<DeliveryOutcomeResult> {
  const mapping = mapTwilioStatusCallback(payload);
  if (mapping.kind === "ignored") {
    return {
      applied: false,
      status: null,
      reasonCode: null,
      detail: mapping.detail,
      runId: null,
    };
  }

  return recordDeliveryOutcome({
    orgId: payload.orgId,
    journeyDeliveryId: payload.journeyDeliveryId,
    status: mapping.status,
    reasonCode: mapping.reasonCode,
    providerMessageId: mapping.providerMessageId,
    providerMetadata: mapping.providerMetadata,
    expectedChannel: "sms",
  });
}

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
