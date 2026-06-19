import { describe, expect, mock, test } from "bun:test";
import {
  sendJourneyActionSendTwilioCallbackReceived,
  sendJourneyRunStart,
  type JourneyRunStartEventData,
} from "./runtime-events.js";

const runStartPayload: JourneyRunStartEventData = {
  orgId: "org_1",
  journeyRunId: "run_1",
  journeyId: "journey_1",
  journeyVersionId: "version_1",
  triggerEntityType: "appointment",
  triggerEntityId: "appt_1",
  appointmentId: "appt_1",
  clientId: null,
  mode: "live",
  triggerBranch: "scheduled",
  triggerEventType: "appointment.scheduled",
  eventTimestamp: "2026-02-16T10:00:00.000Z",
};

describe("journey runtime events", () => {
  test("sends a run-start event with a stable run-keyed id", async () => {
    const sendMock = mock(
      async (_input: unknown): Promise<unknown> => ({ eventId: "evt-default" }),
    );
    sendMock.mockResolvedValueOnce({ eventId: "evt-run-start-1" });

    const result = await sendJourneyRunStart(runStartPayload, sendMock);

    expect(sendMock).toHaveBeenCalledWith({
      id: "journey-run-start-run_1",
      name: "journey.run.start",
      data: runStartPayload,
    });
    expect(result).toEqual({ eventId: "evt-run-start-1" });
  });

  test("extracts the event id from an ids array response", async () => {
    const sendMock = mock(
      async (_input: unknown): Promise<unknown> => ({ eventId: "evt-default" }),
    );
    sendMock.mockResolvedValueOnce({ ids: ["evt-run-start-2"] });

    const result = await sendJourneyRunStart(runStartPayload, sendMock);
    expect(result).toEqual({ eventId: "evt-run-start-2" });
  });

  test("sends twilio callback received events with status-specific id", async () => {
    const sendMock = mock(
      async (_input: unknown): Promise<unknown> => ({ eventId: "evt-default" }),
    );
    sendMock.mockResolvedValueOnce({ eventId: "evt-twilio-callback-1" });

    const result = await sendJourneyActionSendTwilioCallbackReceived(
      {
        orgId: "org_1",
        journeyDeliveryId: "delivery_1",
        messageSid: "SM123",
        messageStatus: "DELIVERED",
        errorCode: null,
      },
      sendMock,
    );

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

  test("returns empty metadata when the send response has no event id", async () => {
    const sendMock = mock(async (_input: unknown): Promise<unknown> => ({}));

    const result = await sendJourneyRunStart(runStartPayload, sendMock);
    expect(result).toEqual({});
  });
});
