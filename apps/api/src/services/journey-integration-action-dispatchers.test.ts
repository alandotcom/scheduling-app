import { describe, expect, test } from "bun:test";
import { dispatchJourneySendResendAction } from "./integrations/resend/delivery.js";
import { dispatchJourneySendSlackAction } from "./integrations/slack/delivery.js";
import { dispatchJourneySendTwilioAction } from "./integrations/twilio/delivery.js";
import { JourneyDeliveryNonRetryableError } from "./delivery-dispatch-helpers.js";

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
      "Action type mismatch. Expected one of: send-resend, send-resend-template.",
    );
  });

  test("dispatchJourneySendSlackAction rejects missing or non-slack action types", async () => {
    await expect(
      dispatchJourneySendSlackAction({
        ...baseDispatchInput,
        channel: "slack",
        stepConfig: {},
      }),
    ).rejects.toThrow("Action type mismatch. Expected one of: send-slack.");
  });

  test("dispatchJourneySendTwilioAction sends interpolated SMS via Twilio transport dependency", async () => {
    const sent = await dispatchJourneySendTwilioAction(
      {
        ...baseDispatchInput,
        channel: "sms",
        stepConfig: {
          actionType: "send-twilio",
          toPhone: "@Appointment.data.client.phone",
          message:
            "Hi @Appointment.data.client.firstName, your appointment starts @Appointment.data.startAt",
        },
        templateContext: {
          Appointment: {
            data: {
              startAt: "2026-02-16T10:00:00.000Z",
              client: {
                firstName: "Avery",
                phone: "+14155552671",
              },
            },
          },
        },
      },
      {
        resolveCredentials: async () => ({
          accountSid: "AC123",
          authToken: "secret",
          messagingServiceSid: "MG1234567890abcdef1234567890abcdef",
        }),
        sendMessage: async ({
          to,
          body,
          messagingServiceSid,
          statusCallback,
        }) => {
          expect(to).toBe("+14155552671");
          expect(body).toContain("Hi Avery");
          expect(body).toContain("2026-02-16T10:00:00.000Z");
          expect(messagingServiceSid).toBe(
            "MG1234567890abcdef1234567890abcdef",
          );
          expect(statusCallback).toContain(
            "/api/integrations/twilio/status-callback",
          );
          expect(statusCallback).toContain("orgId=org_1");
          expect(statusCallback).toContain("journeyDeliveryId=delivery_1");
          return { sid: "SM123" };
        },
      },
    );

    expect(sent).toEqual({
      providerMessageId: "twilio:SM123",
      reasonCode: null,
      awaitingAsyncCallback: true,
    });
  });

  test("dispatchJourneySendTwilioAction does not treat email addresses as template tokens", async () => {
    await dispatchJourneySendTwilioAction(
      {
        ...baseDispatchInput,
        channel: "sms",
        stepConfig: {
          actionType: "send-twilio",
          toPhone: "+14155552671",
          message:
            "Questions? Email support@example.com or call @Appointment.data.client.phone",
        },
        templateContext: {
          Appointment: {
            data: {
              client: {
                phone: "+14155552671",
              },
            },
          },
        },
      },
      {
        resolveCredentials: async () => ({
          accountSid: "AC123",
          authToken: "secret",
          messagingServiceSid: "MG1234567890abcdef1234567890abcdef",
        }),
        sendMessage: async ({ body }) => {
          expect(body).toContain("support@example.com");
          expect(body).toContain("+14155552671");
          return { sid: "SM124" };
        },
      },
    );
  });

  test("dispatchJourneySendTwilioAction supports test-mode routing and fallback", async () => {
    const routed = await dispatchJourneySendTwilioAction(
      {
        ...baseDispatchInput,
        channel: "sms",
        runMode: "test",
        stepConfig: {
          actionType: "send-twilio",
          testBehavior: "route_to_integration_test_recipient",
        },
      },
      {
        resolveTestRecipient: async () => "+14155552671",
      },
    );

    expect(routed).toEqual({
      providerMessageId: `twilio:test-recipient:${baseDispatchInput.idempotencyKey}`,
      reasonCode: "test_mode_routed_integration_recipient",
    });

    const fallback = await dispatchJourneySendTwilioAction(
      {
        ...baseDispatchInput,
        channel: "sms",
        runMode: "test",
        stepConfig: {
          actionType: "send-twilio",
          testBehavior: "route_to_integration_test_recipient",
        },
      },
      {
        resolveTestRecipient: async () => null,
      },
    );

    expect(fallback).toEqual({
      providerMessageId: `twilio:test-log-fallback:${baseDispatchInput.idempotencyKey}`,
      reasonCode: "test_mode_log_fallback_missing_recipient",
    });
  });

  test("dispatchJourneySendTwilioAction defaults to test-mode log-only", async () => {
    const result = await dispatchJourneySendTwilioAction({
      ...baseDispatchInput,
      channel: "sms",
      runMode: "test",
      stepConfig: {
        actionType: "send-twilio",
      },
    });

    expect(result).toEqual({
      providerMessageId: `twilio:test-log-only:${baseDispatchInput.idempotencyKey}`,
      reasonCode: "test_mode_log_only",
    });
  });

  test("dispatchJourneySendTwilioAction rejects missing message content", async () => {
    let thrown: unknown;
    try {
      await dispatchJourneySendTwilioAction(
        {
          ...baseDispatchInput,
          channel: "sms",
          stepConfig: {
            actionType: "send-twilio",
            toPhone: "+14155552671",
            message: "   ",
          },
        },
        {
          resolveCredentials: async () => ({
            accountSid: "AC123",
            authToken: "secret",
            messagingServiceSid: "MG1234567890abcdef1234567890abcdef",
          }),
        },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(JourneyDeliveryNonRetryableError);
    if (!(thrown instanceof Error)) {
      throw new Error("Expected Twilio dispatcher to throw an Error instance");
    }
    expect(thrown.message).toBe(
      "Twilio SMS step requires a non-empty message body.",
    );
  });

  test("dispatchJourneySendTwilioAction rejects missing or invalid recipients", async () => {
    await expect(
      dispatchJourneySendTwilioAction(
        {
          ...baseDispatchInput,
          channel: "sms",
          stepConfig: {
            actionType: "send-twilio",
            message: "Reminder",
            toPhone: "not-a-phone",
          },
        },
        {
          resolveCredentials: async () => ({
            accountSid: "AC123",
            authToken: "secret",
            messagingServiceSid: "MG1234567890abcdef1234567890abcdef",
          }),
        },
      ),
    ).rejects.toThrow(
      "Twilio SMS recipient is missing or invalid. Use E.164 format (for example +14155552671).",
    );
  });

  test("dispatchJourneySendTwilioAction rejects unsupported action types", async () => {
    await expect(
      dispatchJourneySendTwilioAction({
        ...baseDispatchInput,
        channel: "sms",
        stepConfig: {
          actionType: "send-slack",
        },
      }),
    ).rejects.toThrow("Action type mismatch. Expected one of: send-twilio.");
  });

  test("dispatchJourneySendTwilioAction times out slow Twilio calls", async () => {
    await expect(
      dispatchJourneySendTwilioAction(
        {
          ...baseDispatchInput,
          channel: "sms",
          stepConfig: {
            actionType: "send-twilio",
            message: "Reminder",
            toPhone: "+14155552671",
          },
        },
        {
          sendTimeoutMs: 1,
          resolveCredentials: async () => ({
            accountSid: "AC123",
            authToken: "secret",
            messagingServiceSid: "MG1234567890abcdef1234567890abcdef",
          }),
          sendMessage: () => new Promise(() => {}),
        },
      ),
    ).rejects.toThrow("Twilio send timed out after 1ms");
  });
});
