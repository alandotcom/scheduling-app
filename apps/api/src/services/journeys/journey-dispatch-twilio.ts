import {
  assertActionType,
  JourneyDeliveryNonRetryableError,
  resolveTestModeResult,
  type JourneyDeliveryDispatchInput,
  type JourneyDeliveryDispatchResult,
} from "./delivery-dispatch-helpers.js";
import {
  buildTwilioStatusCallbackUrl,
  normalizeTwilioPhone,
  resolveTwilioIntegrationTestRecipient,
  sendTwilioSms,
  type TwilioCredentials,
} from "../integrations/twilio/delivery.js";
import { ProviderSendError } from "../integrations/provider-send-error.js";
import { loadDeliveryTemplateContextByRun } from "./journey-template-context.js";
import { resolveTemplateString } from "./template-resolution.js";

// Journey-side SMS dispatcher: renders the journey step into a recipient + body,
// honors test-mode, then calls DOWN into the thin Twilio adapter. It owns all
// journey concepts (the dispatch contract, template context, the async-callback
// lifecycle) so the adapter stays journey-free.
type TwilioDispatcherDependencies = {
  resolveTestRecipient?: (orgId: string) => Promise<string | null>;
  resolveCredentials?: (orgId: string) => Promise<TwilioCredentials>;
  resolveStatusCallbackUrl?: (input: {
    orgId: string;
    journeyDeliveryId: string;
  }) => string;
  loadTemplateContext?: (input: {
    orgId: string;
    triggerEntityType: "appointment" | "client";
    appointmentId?: string | null;
    clientId?: string | null;
  }) => Promise<Record<string, unknown>>;
  sendTimeoutMs?: number;
  sendMessage?: (input: {
    accountSid: string;
    apiKeySid: string;
    apiKeySecret: string;
    messagingServiceSid: string;
    to: string;
    body: string;
    statusCallback: string;
  }) => Promise<{ sid: string }>;
};

export async function dispatchJourneySendTwilioAction(
  input: JourneyDeliveryDispatchInput,
  dependencies: TwilioDispatcherDependencies = {},
): Promise<JourneyDeliveryDispatchResult> {
  assertActionType(input, "send-twilio");

  const testResult = await resolveTestModeResult({
    providerKey: "twilio",
    idempotencyKey: input.idempotencyKey,
    stepConfig: input.stepConfig,
    runMode: input.runMode ?? "live",
    orgId: input.orgId,
    resolveTestRecipient:
      dependencies.resolveTestRecipient ??
      resolveTwilioIntegrationTestRecipient,
  });
  if (testResult) {
    return testResult;
  }

  let context: Record<string, unknown>;
  if (dependencies.loadTemplateContext) {
    context = await dependencies.loadTemplateContext({
      orgId: input.orgId,
      triggerEntityType: input.triggerEntityType ?? "appointment",
      appointmentId: input.appointmentId ?? null,
      clientId: input.clientId ?? null,
    });
  } else if (input.appointmentId || input.triggerEntityType === "client") {
    context = await loadDeliveryTemplateContextByRun({
      orgId: input.orgId,
      triggerEntityType: input.triggerEntityType ?? "appointment",
      appointmentId: input.appointmentId ?? null,
      clientId: input.clientId ?? null,
    });
  } else {
    context = {};
  }

  const messageBody = resolveTemplateString(
    input.stepConfig["message"],
    context,
  );
  if (!messageBody) {
    throw new JourneyDeliveryNonRetryableError(
      "Twilio SMS step requires a non-empty message body.",
    );
  }

  const explicitRecipient = resolveTemplateString(
    input.stepConfig["toPhone"],
    context,
  );
  const fallbackRecipient = resolveTemplateString(
    "@client.data.phone",
    context,
  );
  const recipient = normalizeTwilioPhone(
    explicitRecipient ?? fallbackRecipient,
  );
  if (!recipient) {
    throw new JourneyDeliveryNonRetryableError(
      "Twilio SMS recipient is missing or invalid. Use E.164 format (for example +14155552671).",
    );
  }

  const resolveStatusCallbackUrl =
    dependencies.resolveStatusCallbackUrl ??
    ((callbackInput: { orgId: string; journeyDeliveryId: string }) =>
      buildTwilioStatusCallbackUrl(callbackInput));
  const statusCallbackUrl = resolveStatusCallbackUrl({
    orgId: input.orgId,
    journeyDeliveryId: input.journeyDeliveryId,
  });

  try {
    const sent = await sendTwilioSms(
      {
        orgId: input.orgId,
        to: recipient,
        body: messageBody,
        statusCallbackUrl,
      },
      {
        ...(dependencies.resolveCredentials
          ? { resolveCredentials: dependencies.resolveCredentials }
          : {}),
        ...(dependencies.sendMessage
          ? { sendMessage: dependencies.sendMessage }
          : {}),
        ...(dependencies.sendTimeoutMs !== undefined
          ? { sendTimeoutMs: dependencies.sendTimeoutMs }
          : {}),
      },
    );

    return {
      providerMessageId: sent.providerMessageId,
      reasonCode: null,
      awaitingAsyncCallback: true,
    };
  } catch (error) {
    if (error instanceof ProviderSendError && !error.retryable) {
      throw new JourneyDeliveryNonRetryableError(error.message, {
        cause: error,
      });
    }
    throw error;
  }
}
