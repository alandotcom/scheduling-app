import { forEachAsync } from "es-toolkit/array";
import type {
  AnyDomainEvent,
  DomainEvent,
  IntegrationConsumer,
} from "@integrations/core";
import { integrationSupportsEvent } from "@integrations/core";
import {
  webhookEventDataSchemaByType,
  webhookEventTypes,
  type WebhookEventData,
  type WebhookEventType,
} from "@scheduling/dto";
import { getEnabledIntegrationsForOrg } from "../../services/integrations/runtime.js";
import { inngest } from "../client.js";

type ResolveIntegrations = (
  orgId: string,
) => Promise<readonly IntegrationConsumer[]>;

function parseWebhookPayload<TEventType extends WebhookEventType>(
  eventType: TEventType,
  payloadInput: unknown,
): WebhookEventData<TEventType> {
  return webhookEventDataSchemaByType[eventType].parse(
    payloadInput,
  ) as WebhookEventData<TEventType>;
}

export function createIntegrationFanoutFunction<
  TEventType extends WebhookEventType,
>(
  eventType: TEventType,
  resolveIntegrations: ResolveIntegrations = getEnabledIntegrationsForOrg,
) {
  return inngest.createFunction(
    {
      id: `integration-fanout-${eventType.replaceAll(".", "-")}`,
      retries: 10,
    },
    { event: eventType },
    async ({ event, step }) => {
      const { orgId, ...payloadInput } = event.data;
      const payload = parseWebhookPayload(eventType, payloadInput);
      const domainEvent: DomainEvent<TEventType> = {
        id: event.id ?? Bun.randomUUIDv7(),
        type: eventType,
        orgId,
        payload,
        timestamp: new Date(event.ts ?? Date.now()).toISOString(),
      };

      const dispatchedIntegrationNames = await step.run(
        "dispatch-integrations",
        async () => {
          const integrations = await resolveIntegrations(domainEvent.orgId);
          const targetIntegrations = integrations.filter((integration) =>
            integrationSupportsEvent(integration, domainEvent.type),
          );

          await forEachAsync(
            targetIntegrations,
            async (integration) => {
              await integration.process(domainEvent as AnyDomainEvent);
            },
            { concurrency: 1 },
          );

          return targetIntegrations.map((integration) => integration.name);
        },
      );

      return {
        eventId: domainEvent.id,
        eventType: domainEvent.type,
        orgId: domainEvent.orgId,
        dispatchedIntegrationNames,
      };
    },
  );
}

export const integrationFanoutFunctions = webhookEventTypes.map((eventType) =>
  createIntegrationFanoutFunction(eventType),
);
