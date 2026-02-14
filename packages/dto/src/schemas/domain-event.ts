import {
  webhookEventDataSchemaByType,
  webhookEventEnvelopeSchema,
  webhookEventEnvelopeSchemaByType,
  webhookEventTypeSchema,
  webhookEventTypes,
  type WebhookEventData,
  type WebhookEventDataByType,
  type WebhookEventEnvelope,
  type WebhookEventType,
} from "./webhook";
import { z } from "zod";

export const domainEventTypes = webhookEventTypes;
export type DomainEventType = WebhookEventType;

export const domainEventTypeSchema = webhookEventTypeSchema;

export const domainEventDataSchemaByType = webhookEventDataSchemaByType;
export type DomainEventDataByType = WebhookEventDataByType;
export type DomainEventData<TEventType extends DomainEventType> =
  WebhookEventData<TEventType>;

export const domainEventEnvelopeSchemaByType = webhookEventEnvelopeSchemaByType;
export const domainEventEnvelopeSchema = webhookEventEnvelopeSchema;
export type DomainEventEnvelope = WebhookEventEnvelope;

export const domainEventDomains = [
  "appointment",
  "calendar",
  "appointment_type",
  "resource",
  "location",
  "client",
] as const;

export type DomainEventDomain = (typeof domainEventDomains)[number];
export const domainEventDomainSchema = z.enum(domainEventDomains);

export function getDomainForDomainEventType(
  eventType: DomainEventType,
): DomainEventDomain {
  const [prefix] = eventType.split(".");

  if (
    prefix === "appointment" ||
    prefix === "calendar" ||
    prefix === "appointment_type" ||
    prefix === "resource" ||
    prefix === "location" ||
    prefix === "client"
  ) {
    return prefix;
  }

  return "appointment";
}

export const domainEventTypesByDomain: Record<
  DomainEventDomain,
  readonly DomainEventType[]
> = {
  appointment: domainEventTypes.filter((eventType) =>
    eventType.startsWith("appointment."),
  ),
  calendar: domainEventTypes.filter((eventType) =>
    eventType.startsWith("calendar."),
  ),
  appointment_type: domainEventTypes.filter((eventType) =>
    eventType.startsWith("appointment_type."),
  ),
  resource: domainEventTypes.filter((eventType) =>
    eventType.startsWith("resource."),
  ),
  location: domainEventTypes.filter((eventType) =>
    eventType.startsWith("location."),
  ),
  client: domainEventTypes.filter((eventType) =>
    eventType.startsWith("client."),
  ),
};
