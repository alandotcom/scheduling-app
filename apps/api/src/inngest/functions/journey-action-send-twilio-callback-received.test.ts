import { describe, expect, mock, test } from "bun:test";
import { InngestTestEngine } from "@inngest/test";
import { createJourneyActionSendTwilioCallbackReceivedFunction } from "./journey-action-send-twilio-callback-received.js";

describe("journey action send twilio callback received function", () => {
  test("configures callback processor with shared and twilio concurrency", () => {
    const fn = createJourneyActionSendTwilioCallbackReceivedFunction(
      async () => ({
        applied: true,
        status: "sent",
        reasonCode: null,
        detail: "applied_sent",
      }),
    );

    expect(fn["opts"]).toMatchObject({
      id: "journey-action-send-twilio-callback-received",
      retries: 2,
      concurrency: [
        {
          key: '"journey-delivery:" + event.data.orgId',
          scope: "env",
          limit: 20,
        },
        {
          key: "event.data.orgId",
          scope: "fn",
          limit: 10,
        },
      ],
    });
  });

  test("forwards callback payload to twilio callback applicator", async () => {
    const applyCallback = mock(async () => ({
      applied: true,
      status: "failed" as const,
      reasonCode: "twilio_status:failed:error_30003",
      detail: "applied_failed",
    }));

    const fn =
      createJourneyActionSendTwilioCallbackReceivedFunction(applyCallback);
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          name: "journey.action.send-twilio.callback-received",
          data: {
            orgId: "org_1",
            journeyDeliveryId: "delivery_1",
            messageSid: "SM123",
            messageStatus: "failed",
            errorCode: "30003",
          },
        },
      ],
    });

    expect(result).toEqual({
      applied: true,
      status: "failed",
      reasonCode: "twilio_status:failed:error_30003",
      detail: "applied_failed",
    });
    expect(applyCallback).toHaveBeenCalledTimes(1);
    expect(applyCallback).toHaveBeenCalledWith({
      orgId: "org_1",
      journeyDeliveryId: "delivery_1",
      messageSid: "SM123",
      messageStatus: "failed",
      errorCode: "30003",
    });
  });
});
