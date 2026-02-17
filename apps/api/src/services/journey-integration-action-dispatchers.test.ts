import { describe, expect, test } from "bun:test";
import {
  dispatchJourneySendResendAction,
  dispatchJourneySendSlackAction,
} from "./journey-integration-action-dispatchers.js";

const baseDispatchInput = {
  orgId: "org_1",
  journeyRunId: "run_1",
  journeyDeliveryId: "delivery_1",
  channel: "email",
  idempotencyKey: "run_1:send-node:2026-02-16T10:00:00.000Z",
};

describe("journey integration action dispatchers", () => {
  test("dispatchJourneySendResendAction supports resend and resend-template actions", async () => {
    const resendResult = await dispatchJourneySendResendAction({
      ...baseDispatchInput,
      stepConfig: {
        actionType: "send-resend",
      },
    });

    const resendTemplateResult = await dispatchJourneySendResendAction({
      ...baseDispatchInput,
      stepConfig: {
        actionType: "send-resend-template",
      },
    });

    expect(resendResult).toEqual({
      providerMessageId: `resend:${baseDispatchInput.idempotencyKey}`,
    });
    expect(resendTemplateResult).toEqual({
      providerMessageId: `resend:${baseDispatchInput.idempotencyKey}`,
    });
  });

  test("dispatchJourneySendSlackAction normalizes actionType and returns slack provider id", async () => {
    const result = await dispatchJourneySendSlackAction({
      ...baseDispatchInput,
      channel: "slack",
      stepConfig: {
        actionType: " Send-Slack ",
      },
    });

    expect(result).toEqual({
      providerMessageId: `slack:${baseDispatchInput.idempotencyKey}`,
    });
  });

  test("dispatchJourneySendResendAction rejects unsupported action types", async () => {
    await expect(
      dispatchJourneySendResendAction({
        ...baseDispatchInput,
        stepConfig: {
          actionType: "send-slack",
        },
      }),
    ).rejects.toThrow(
      "Action type mismatch for integration dispatcher. Expected send-resend, send-resend-template.",
    );
  });

  test("dispatchJourneySendSlackAction rejects missing or non-slack action types", async () => {
    await expect(
      dispatchJourneySendSlackAction({
        ...baseDispatchInput,
        channel: "slack",
        stepConfig: {},
      }),
    ).rejects.toThrow(
      "Action type mismatch for integration dispatcher. Expected send-slack.",
    );
  });
});
