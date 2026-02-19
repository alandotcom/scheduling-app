import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { inngest } from "./client.js";
import type { JourneyDeliveryScheduledEventData } from "./runtime-events.js";
import {
  sendJourneyActionExecuteForActionType,
  sendJourneyActionSendTwilioCallbackReceived,
  sendJourneyDeliveryCanceled,
  sendJourneyDeliveryScheduled,
} from "./runtime-events.js";

const sendMock = mock(
  async (_input: unknown): Promise<unknown> => ({
    eventId: "evt-default",
  }),
);
const originalSend = inngest.send.bind(inngest);

const scheduledPayload: JourneyDeliveryScheduledEventData = {
  orgId: "org_1",
  journeyDeliveryId: "delivery_1",
  journeyRunId: "run_1",
  deterministicKey: "run_1:send-node:2026-02-16T10:00:00.000Z",
  scheduledFor: "2026-02-16T10:00:00.000Z",
};

describe("journey runtime events", () => {
  beforeEach(() => {
    sendMock.mockReset();
    Object.assign(inngest, {
      send: sendMock as typeof inngest.send,
    });
  });

  afterEach(() => {
    Object.assign(inngest, {
      send: originalSend,
    });
  });

  test("sends resend execute events with provider-specific event name", async () => {
    sendMock.mockResolvedValueOnce({ eventId: "evt-resend-1" });

    const result = await sendJourneyActionExecuteForActionType(
      "send-resend",
      scheduledPayload,
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      id: "journey-action-send-resend-execute-delivery_1",
      name: "journey.action.send-resend.execute",
      data: scheduledPayload,
    });
    expect(result).toEqual({ eventId: "evt-resend-1" });
  });

  test("sends slack execute events and extracts event id from ids array", async () => {
    sendMock.mockResolvedValueOnce({ ids: ["evt-slack-1"] });

    const result = await sendJourneyActionExecuteForActionType(
      "send-slack",
      scheduledPayload,
    );

    expect(sendMock).toHaveBeenCalledWith({
      id: "journey-action-send-slack-execute-delivery_1",
      name: "journey.action.send-slack.execute",
      data: scheduledPayload,
    });
    expect(result).toEqual({ eventId: "evt-slack-1" });
  });

  test("sends twilio execute events and extracts event id from id field", async () => {
    sendMock.mockResolvedValueOnce({ id: "evt-twilio-1" });

    const result = await sendJourneyActionExecuteForActionType(
      "send-twilio",
      scheduledPayload,
    );

    expect(sendMock).toHaveBeenCalledWith({
      id: "journey-action-send-twilio-execute-delivery_1",
      name: "journey.action.send-twilio.execute",
      data: scheduledPayload,
    });
    expect(result).toEqual({ eventId: "evt-twilio-1" });
  });

  test("sends twilio callback received events with status-specific id", async () => {
    sendMock.mockResolvedValueOnce({ eventId: "evt-twilio-callback-1" });

    const result = await sendJourneyActionSendTwilioCallbackReceived({
      orgId: "org_1",
      journeyDeliveryId: "delivery_1",
      messageSid: "SM123",
      messageStatus: "DELIVERED",
      errorCode: null,
    });

    expect(sendMock).toHaveBeenCalledWith({
      id: "journey-action-send-twilio-callback-received-delivery_1-SM123-delivered",
      name: "journey.action.send-twilio.callback-received",
      data: {
        orgId: "org_1",
        journeyDeliveryId: "delivery_1",
        messageSid: "SM123",
        messageStatus: "DELIVERED",
        errorCode: null,
      },
    });
    expect(result).toEqual({ eventId: "evt-twilio-callback-1" });
  });

  test("extracts event id from array responses for cancellation events", async () => {
    sendMock.mockResolvedValueOnce([{ id: "evt-cancel-1" }]);

    const result = await sendJourneyDeliveryCanceled({
      orgId: "org_1",
      journeyDeliveryId: "delivery_1",
      journeyRunId: "run_1",
      deterministicKey: "run_1:send-node:2026-02-16T10:00:00.000Z",
      reasonCode: "execution_terminal",
    });

    expect(result).toEqual({ eventId: "evt-cancel-1" });
  });

  test("returns empty metadata when inngest send response has no event id", async () => {
    sendMock.mockResolvedValueOnce({});

    const result = await sendJourneyDeliveryScheduled(scheduledPayload);

    expect(result).toEqual({});
  });
});
