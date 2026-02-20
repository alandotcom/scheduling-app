import {
  domainEventDataSchemaByType,
  type DomainEventDataByType,
  type DomainEventType,
} from "@scheduling/dto";
import { inngest } from "../client.js";
import { processJourneyDomainEvent } from "../../services/journey-planner.js";

const journeyPlannerEventTypes = [
  "appointment.scheduled",
  "appointment.rescheduled",
  "appointment.canceled",
  "client.created",
  "client.updated",
] as const satisfies readonly DomainEventType[];

type JourneyPlannerDomainEventType = (typeof journeyPlannerEventTypes)[number];
type ProcessJourneyDomainEvent = typeof processJourneyDomainEvent;

function parsePayloadForEvent(
  eventType: JourneyPlannerDomainEventType,
  payloadInput: unknown,
): DomainEventDataByType[JourneyPlannerDomainEventType] {
  const parsed = domainEventDataSchemaByType[eventType].safeParse(payloadInput);
  if (!parsed.success || parsed.data === undefined) {
    throw new Error(`Invalid payload for event type "${eventType}".`);
  }
  return parsed.data;
}

export function createJourneyDomainTriggerFunction<
  TEventType extends JourneyPlannerDomainEventType,
>(
  eventType: TEventType,
  processEvent: ProcessJourneyDomainEvent = processJourneyDomainEvent,
) {
  return inngest.createFunction(
    {
      id: `journey-domain-trigger-${eventType.replaceAll(".", "-")}`,
      retries: 3,
      concurrency: {
        key: "event.data.orgId",
        limit: 20,
      },
    },
    { event: eventType },
    async ({ event }) => {
      const { orgId, ...payloadInput } = event.data;
      const payload = parsePayloadForEvent(eventType, payloadInput);

      return processEvent({
        id: event.id ?? Bun.randomUUIDv7(),
        orgId,
        type: eventType,
        payload,
        timestamp: new Date(event.ts ?? Date.now()).toISOString(),
      });
    },
  );
}

export const journeyDomainTriggerFunctions = journeyPlannerEventTypes.map(
  (eventType) => createJourneyDomainTriggerFunction(eventType),
);
