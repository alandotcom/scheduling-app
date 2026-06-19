import { eventType, Inngest, staticSchema } from "inngest";
import { z } from "zod";
import type { DomainEventData, DomainEventType } from "@scheduling/dto";
import { config } from "../config.js";

// Internal (engine-owned) events.
//
// Domain events (appointment.* / client.*) keep plain string triggers and are
// validated by their canonical DTO Zod schemas at the handler boundary — those
// schemas use coercion/transforms, which Inngest v4's eventType() disallows
// (input and output types must match). The internal events below have flat,
// transform-free shapes, so we define them as typed eventType() triggers: Zod
// gives compile-time typing for handlers plus runtime validation on receipt.

const deliveryScheduledData = z.object({
  orgId: z.string(),
  journeyDeliveryId: z.string(),
  journeyRunId: z.string(),
  deterministicKey: z.string(),
  scheduledFor: z.string(),
});

const twilioCallbackReceivedData = z.object({
  orgId: z.string(),
  journeyDeliveryId: z.string(),
  messageSid: z.string(),
  messageStatus: z.string(),
  errorCode: z.string().nullish(),
});

const devPingData = z.object({ orgId: z.string() });

export const providerExecuteEventNames = [
  "journey.action.send-resend.execute",
  "journey.action.send-slack.execute",
  "journey.action.send-twilio.execute",
  "journey.wait-resume.execute",
  "journey.wait-for-confirmation-timeout.execute",
] as const;

export type ProviderExecuteEventName =
  (typeof providerExecuteEventNames)[number];

// The provider-execute events plus the legacy journey.delivery.scheduled fanout
// event all carry the same delivery-scheduled payload shape. Written as an
// explicit literal so each value's EventType is inferred precisely without a
// narrowing cast.
export const deliveryEvents = {
  "journey.action.send-resend.execute": eventType(
    "journey.action.send-resend.execute",
    { schema: deliveryScheduledData },
  ),
  "journey.action.send-slack.execute": eventType(
    "journey.action.send-slack.execute",
    { schema: deliveryScheduledData },
  ),
  "journey.action.send-twilio.execute": eventType(
    "journey.action.send-twilio.execute",
    { schema: deliveryScheduledData },
  ),
  "journey.wait-resume.execute": eventType("journey.wait-resume.execute", {
    schema: deliveryScheduledData,
  }),
  "journey.wait-for-confirmation-timeout.execute": eventType(
    "journey.wait-for-confirmation-timeout.execute",
    { schema: deliveryScheduledData },
  ),
  "journey.delivery.scheduled": eventType("journey.delivery.scheduled", {
    schema: deliveryScheduledData,
  }),
};

// Domain events (appointment.* / client.*) are dynamic and DTO-validated in the
// handler. A type-only envelope trigger gives the handler a typed event.data
// (always carrying orgId) without a cast; runtime validation stays in the DTO.
const domainEventEnvelopeSchema = staticSchema<
  { orgId: string } & Record<string, unknown>
>();

export function domainTriggerEvent(name: string) {
  return eventType(name, { schema: domainEventEnvelopeSchema });
}

export const devPingEvent = eventType("scheduling/dev.ping", {
  schema: devPingData,
});

export const twilioCallbackReceivedEvent = eventType(
  "journey.action.send-twilio.callback-received",
  { schema: twilioCallbackReceivedData },
);

export const inngest = new Inngest({
  id: "scheduling-api",
  // v4 defaults to cloud mode, which requires a signing key. Locally there is
  // none, so fall back to dev mode when no signing key is configured.
  isDev: !config.inngest.signingKey,
  ...(config.inngest.eventKey ? { eventKey: config.inngest.eventKey } : {}),
  ...(config.inngest.baseUrl ? { baseUrl: config.inngest.baseUrl } : {}),
  ...(config.inngest.signingKey
    ? { signingKey: config.inngest.signingKey }
    : {}),
  ...(config.inngest.servePath ? { servePath: config.inngest.servePath } : {}),
  ...(config.inngest.serveHost
    ? { serveOrigin: config.inngest.serveHost }
    : {}),
});

/**
 * Typed wrapper for sending domain events through the main Inngest client.
 * Constrains callers to domain event types and payloads. The client itself is
 * untyped (v4 removed centralized client schemas), so this wrapper is the
 * source of compile-time safety for domain-event producers.
 */
export function sendDomainEvent<K extends DomainEventType>(event: {
  id: string;
  name: K;
  data: { orgId: string } & DomainEventData<K>;
  ts: number;
}) {
  return inngest.send(event);
}
