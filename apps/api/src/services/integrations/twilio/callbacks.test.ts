import { describe, expect, test } from "bun:test";
import { mapTwilioStatusCallback } from "./callbacks.js";

const basePayload = {
  orgId: "org_1",
  journeyDeliveryId: "delivery_1",
};

describe("mapTwilioStatusCallback", () => {
  test("maps a delivered status to a terminal sent outcome", () => {
    const mapping = mapTwilioStatusCallback({
      ...basePayload,
      messageSid: "SM123",
      messageStatus: "delivered",
      errorCode: null,
    });

    expect(mapping).toEqual({
      kind: "terminal",
      status: "sent",
      providerMessageId: "twilio:SM123",
      reasonCode: null,
      providerMetadata: { twilioStatus: "delivered", twilioErrorCode: null },
    });
  });

  test("maps an undelivered status to a terminal failed outcome with a reason code", () => {
    const mapping = mapTwilioStatusCallback({
      ...basePayload,
      messageSid: "SM456",
      messageStatus: "undelivered",
      errorCode: "30007",
    });

    expect(mapping).toEqual({
      kind: "terminal",
      status: "failed",
      providerMessageId: "twilio:SM456",
      reasonCode: "twilio_status:undelivered:error_30007",
      providerMetadata: {
        twilioStatus: "undelivered",
        twilioErrorCode: "30007",
      },
    });
  });

  test("ignores non-terminal statuses", () => {
    expect(
      mapTwilioStatusCallback({
        ...basePayload,
        messageSid: "SM789",
        messageStatus: "queued",
        errorCode: null,
      }),
    ).toEqual({
      kind: "ignored",
      detail: "ignored_non_terminal_status:queued",
    });
  });

  test("ignores a terminal status with a missing message sid", () => {
    expect(
      mapTwilioStatusCallback({
        ...basePayload,
        messageSid: "   ",
        messageStatus: "delivered",
        errorCode: null,
      }),
    ).toEqual({ kind: "ignored", detail: "ignored_missing_message_sid" });
  });
});
