import {
  domainEventDataSchemaByType,
  domainEventTypes,
  type DomainEventType,
} from "@scheduling/dto";
import { inngest } from "../client.js";
import { processWorkflowDomainEvent } from "../../services/workflow-domain-triggers.js";

type ProcessWorkflowDomainEvent = typeof processWorkflowDomainEvent;

export function createWorkflowDomainTriggerFunction<
  TEventType extends DomainEventType,
>(
  eventType: TEventType,
  processEvent: ProcessWorkflowDomainEvent = processWorkflowDomainEvent,
) {
  return inngest.createFunction(
    {
      id: `workflow-domain-trigger-${eventType.replaceAll(".", "-")}`,
      retries: 3,
      concurrency: {
        key: "event.data.orgId",
        limit: 20,
      },
    },
    { event: eventType },
    async ({ event }) => {
      const { orgId, ...payloadInput } = event.data;
      const payloadParsed =
        domainEventDataSchemaByType[eventType].safeParse(payloadInput);

      if (!payloadParsed.success) {
        throw new Error(`Invalid payload for event type "${eventType}".`);
      }

      return processEvent({
        id: event.id ?? Bun.randomUUIDv7(),
        type: eventType,
        orgId,
        payload: payloadParsed.data,
        timestamp: new Date(event.ts ?? Date.now()).toISOString(),
      });
    },
  );
}

export const workflowDomainTriggerFunctions = domainEventTypes.map(
  (eventType) => createWorkflowDomainTriggerFunction(eventType),
);
