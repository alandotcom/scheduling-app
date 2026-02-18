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
  runMode: "live" as const,
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
      reasonCode: null,
    });
    expect(resendTemplateResult).toEqual({
      providerMessageId: `resend:${baseDispatchInput.idempotencyKey}`,
      reasonCode: null,
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
      reasonCode: null,
    });
  });

  test("dispatchJourneySendResendAction enforces test-mode log-only by default", async () => {
    const result = await dispatchJourneySendResendAction({
      ...baseDispatchInput,
      runMode: "test",
      stepConfig: {
        actionType: "send-resend",
      },
    });

    expect(result).toEqual({
      providerMessageId: `resend:test-log-only:${baseDispatchInput.idempotencyKey}`,
      reasonCode: "test_mode_log_only",
    });
  });

  test("dispatchJourneySendResendAction routes to integration recipient in test mode when configured", async () => {
    const result = await dispatchJourneySendResendAction(
      {
        ...baseDispatchInput,
        runMode: "test",
        stepConfig: {
          actionType: "send-resend",
          testBehavior: "route_to_integration_test_recipient",
        },
      },
      {
        resolveTestRecipient: async () => "qa@example.com",
      },
    );

    expect(result).toEqual({
      providerMessageId: `resend:test-recipient:${baseDispatchInput.idempotencyKey}`,
      reasonCode: "test_mode_routed_integration_recipient",
    });
  });

  test("dispatchJourneySendResendAction safely falls back to log-only when test recipient is missing", async () => {
    const result = await dispatchJourneySendResendAction(
      {
        ...baseDispatchInput,
        runMode: "test",
        stepConfig: {
          actionType: "send-resend-template",
          testBehavior: "route_to_integration_test_recipient",
        },
      },
      {
        resolveTestRecipient: async () => null,
      },
    );

    expect(result).toEqual({
      providerMessageId: `resend:test-log-fallback:${baseDispatchInput.idempotencyKey}`,
      reasonCode: "test_mode_log_fallback_missing_recipient",
    });
  });

  test("dispatchJourneySendSlackAction enforces test-mode log-only", async () => {
    const result = await dispatchJourneySendSlackAction({
      ...baseDispatchInput,
      runMode: "test",
      channel: "slack",
      stepConfig: {
        actionType: "send-slack",
      },
    });

    expect(result).toEqual({
      providerMessageId: `slack:test-log-only:${baseDispatchInput.idempotencyKey}`,
      reasonCode: "test_mode_log_only",
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
