import { inngest } from "./client.js";

export type JourneyDeliveryScheduledEventData = {
  orgId: string;
  journeyDeliveryId: string;
  journeyRunId: string;
  deterministicKey: string;
  scheduledFor: string;
};

export type JourneyDeliveryCanceledEventData = {
  orgId: string;
  journeyDeliveryId: string;
  journeyRunId: string;
  deterministicKey: string;
  reasonCode: string;
};

type InngestSendResult =
  | {
      eventId?: string;
      ids?: string[];
      id?: string;
      eventIds?: string[];
    }
  | Array<{
      eventId?: string;
      ids?: string[];
      id?: string;
      eventIds?: string[];
    }>;

function getEventId(result: unknown): string | undefined {
  if (!result) {
    return;
  }

  if (Array.isArray(result)) {
    return getEventId(result[0]);
  }

  if (typeof result !== "object") {
    return;
  }

  const typedResult = result as InngestSendResult;
  if ("eventId" in typedResult && typeof typedResult.eventId === "string") {
    return typedResult.eventId;
  }
  if ("id" in typedResult && typeof typedResult.id === "string") {
    return typedResult.id;
  }
  if (
    "eventIds" in typedResult &&
    Array.isArray(typedResult.eventIds) &&
    typeof typedResult.eventIds[0] === "string"
  ) {
    return typedResult.eventIds[0];
  }
  if (
    "ids" in typedResult &&
    Array.isArray(typedResult.ids) &&
    typeof typedResult.ids[0] === "string"
  ) {
    return typedResult.ids[0];
  }

  return;
}

export async function sendJourneyDeliveryScheduled(
  input: JourneyDeliveryScheduledEventData,
): Promise<{ eventId?: string }> {
  const response = await inngest.send({
    id: `journey-delivery-scheduled-${input.journeyDeliveryId}`,
    name: "journey.delivery.scheduled",
    data: input,
  });

  const eventId = getEventId(response);
  if (eventId) {
    return { eventId };
  }

  return {};
}

export async function sendJourneyDeliveryCanceled(
  input: JourneyDeliveryCanceledEventData,
): Promise<{ eventId?: string }> {
  const response = await inngest.send({
    id: `journey-delivery-canceled-${input.journeyDeliveryId}`,
    name: "journey.delivery.canceled",
    data: input,
  });

  const eventId = getEventId(response);
  if (eventId) {
    return { eventId };
  }

  return {};
}
