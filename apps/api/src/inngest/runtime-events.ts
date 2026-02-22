import { getProviderForActionType } from "../services/delivery-provider-registry.js";
import { inngest, type ProviderExecuteEventName } from "./client.js";

export type JourneyDeliveryScheduledEventData = {
  orgId: string;
  journeyDeliveryId: string;
  journeyRunId: string;
  deterministicKey: string;
  scheduledFor: string;
};

export type JourneyActionSendTwilioCallbackReceivedEventData = {
  orgId: string;
  journeyDeliveryId: string;
  messageSid: string;
  messageStatus: string;
  errorCode?: string | null;
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

type RuntimeEvent =
  | {
      id: string;
      name: "journey.delivery.scheduled";
      data: JourneyDeliveryScheduledEventData;
    }
  | {
      id: string;
      name: ProviderExecuteEventName | "journey.delivery.scheduled";
      data: JourneyDeliveryScheduledEventData;
    }
  | {
      id: string;
      name: "journey.action.send-twilio.callback-received";
      data: JourneyActionSendTwilioCallbackReceivedEventData;
    }
  | {
      id: string;
      name: "journey.delivery.canceled";
      data: JourneyDeliveryCanceledEventData;
    };

type InngestSend = (event: RuntimeEvent) => Promise<unknown>;

function sendViaInngest(event: RuntimeEvent): Promise<unknown> {
  return inngest.send(event);
}

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
  send: InngestSend = sendViaInngest,
): Promise<{ eventId?: string }> {
  const response = await send({
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

export async function sendJourneyActionExecuteForActionType(
  actionType: string,
  input: JourneyDeliveryScheduledEventData,
  send: InngestSend = sendViaInngest,
): Promise<{ eventId?: string }> {
  const provider = getProviderForActionType(actionType);
  if (!provider) {
    throw new Error(
      `No delivery provider registered for action type "${actionType}".`,
    );
  }

  const response = await send({
    id: `${provider.functionId}-${input.journeyDeliveryId}`,
    name: provider.eventName,
    data: input,
  });

  const eventId = getEventId(response);
  if (eventId) {
    return { eventId };
  }

  return {};
}

export async function sendJourneyActionSendTwilioCallbackReceived(
  input: JourneyActionSendTwilioCallbackReceivedEventData,
  send: InngestSend = sendViaInngest,
): Promise<{ eventId?: string }> {
  const response = await send({
    id: `journey-action-send-twilio-callback-received-${input.journeyDeliveryId}-${input.messageSid}-${input.messageStatus.toLowerCase()}`,
    name: "journey.action.send-twilio.callback-received",
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
  send: InngestSend = sendViaInngest,
): Promise<{ eventId?: string }> {
  const response = await send({
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
