import { inngest } from "./client.js";

export type JourneyActionSendTwilioCallbackReceivedEventData = {
  orgId: string;
  journeyDeliveryId: string;
  messageSid: string;
  messageStatus: string;
  errorCode?: string | null;
};

export type JourneyRunStartEventData = {
  orgId: string;
  journeyRunId: string;
  journeyId: string;
  journeyVersionId: string | null;
  triggerEntityType: "appointment" | "client";
  triggerEntityId: string;
  appointmentId: string | null;
  clientId: string | null;
  mode: "live" | "test";
  triggerBranch?: "scheduled" | "canceled" | "no_show";
  triggerEventType: string;
  eventTimestamp: string;
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
      name: "journey.action.send-twilio.callback-received";
      data: JourneyActionSendTwilioCallbackReceivedEventData;
    }
  | {
      id: string;
      name: "journey.run.start";
      data: JourneyRunStartEventData;
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

export async function sendJourneyRunStart(
  input: JourneyRunStartEventData,
  send: InngestSend = sendViaInngest,
): Promise<{ eventId?: string }> {
  // Stable event id keyed on the run row so a redelivered domain event cannot
  // spawn a duplicate run (composes with the function's idempotency key).
  const response = await send({
    id: `journey-run-start-${input.journeyRunId}`,
    name: "journey.run.start",
    data: input,
  });

  const eventId = getEventId(response);
  if (eventId) {
    return { eventId };
  }

  return {};
}
