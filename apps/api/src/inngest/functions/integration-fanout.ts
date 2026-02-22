import type {
  AnyDomainEvent,
  IntegrationConsumer,
} from "../../services/integrations/contract.js";
import { integrationSupportsEvent } from "../../services/integrations/contract.js";
import {
  domainEventDataSchemaByType,
  domainEventTypes,
  type DomainEventType,
} from "@scheduling/dto";
import { getEnabledIntegrationsForOrg } from "../../services/integrations/runtime.js";
import { inngest } from "../client.js";

type ResolveIntegrations = (
  orgId: string,
) => Promise<readonly IntegrationConsumer[]>;

export const INTEGRATION_FANOUT_FLOW_CONTROL = {
  concurrencyLimit: 20,
  throttleLimitPerMinute: 120,
  throttleBurstPerMinute: 20,
} as const;

type DomainEventCandidate = {
  id: string;
  type: DomainEventType;
  orgId: string;
  payload: unknown;
  timestamp: string;
};

function isAnyDomainEvent(
  event: DomainEventCandidate,
): event is AnyDomainEvent {
  return domainEventDataSchemaByType[event.type].safeParse(event.payload)
    .success;
}

export function createIntegrationFanoutFunction<
  TEventType extends DomainEventType,
>(
  eventType: TEventType,
  resolveIntegrations: ResolveIntegrations = getEnabledIntegrationsForOrg,
) {
  return inngest.createFunction(
    {
      id: `integration-fanout-${eventType.replaceAll(".", "-")}`,
      retries: 10,
      concurrency: {
        key: "event.data.orgId",
        limit: INTEGRATION_FANOUT_FLOW_CONTROL.concurrencyLimit,
      },
      throttle: {
        key: "event.data.orgId",
        limit: INTEGRATION_FANOUT_FLOW_CONTROL.throttleLimitPerMinute,
        period: "1m",
        burst: INTEGRATION_FANOUT_FLOW_CONTROL.throttleBurstPerMinute,
      },
    },
    { event: eventType },
    async ({ event, step }) => {
      const { orgId, ...payloadInput } = event.data;
      const domainEventCandidate: DomainEventCandidate = {
        id: event.id ?? Bun.randomUUIDv7(),
        type: eventType,
        orgId,
        timestamp: new Date(event.ts ?? Date.now()).toISOString(),
        payload: payloadInput,
      };

      if (!isAnyDomainEvent(domainEventCandidate)) {
        throw new Error(`Invalid payload for event type "${eventType}".`);
      }

      const domainEvent = domainEventCandidate;

      const dispatchedIntegrationNames = await step.run(
        "dispatch-integrations",
        async () => {
          const integrations = await resolveIntegrations(domainEvent.orgId);
          const targetIntegrations = integrations.filter((integration) =>
            integrationSupportsEvent(integration, domainEvent.type),
          );

          await Promise.all(
            targetIntegrations.map((integration) =>
              integration.process(domainEvent),
            ),
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

export const integrationFanoutFunctions = domainEventTypes.map((eventType) =>
  createIntegrationFanoutFunction(eventType),
);
