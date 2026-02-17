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
] as const satisfies readonly DomainEventType[];

type JourneyPlannerDomainEventType = (typeof journeyPlannerEventTypes)[number];
type ProcessJourneyDomainEvent = typeof processJourneyDomainEvent;

function parsePayloadForEvent(
  eventType: JourneyPlannerDomainEventType,
  payloadInput: unknown,
): DomainEventDataByType[JourneyPlannerDomainEventType] {
  switch (eventType) {
    case "appointment.scheduled": {
      const parsed =
        domainEventDataSchemaByType["appointment.scheduled"].safeParse(
          payloadInput,
        );
      if (!parsed.success) {
        throw new Error(`Invalid payload for event type "${eventType}".`);
      }

      if (parsed.data === undefined) {
        throw new Error(`Invalid payload for event type "${eventType}".`);
      }

      return parsed.data;
    }
    case "appointment.rescheduled": {
      const parsed =
        domainEventDataSchemaByType["appointment.rescheduled"].safeParse(
          payloadInput,
        );
      if (!parsed.success) {
        throw new Error(`Invalid payload for event type "${eventType}".`);
      }

      if (parsed.data === undefined) {
        throw new Error(`Invalid payload for event type "${eventType}".`);
      }

      return parsed.data;
    }
    case "appointment.canceled": {
      const parsed =
        domainEventDataSchemaByType["appointment.canceled"].safeParse(
          payloadInput,
        );
      if (!parsed.success) {
        throw new Error(`Invalid payload for event type "${eventType}".`);
      }

      if (parsed.data === undefined) {
        throw new Error(`Invalid payload for event type "${eventType}".`);
      }

      return parsed.data;
    }
  }

  throw new Error("Invalid payload for journey event.");
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
