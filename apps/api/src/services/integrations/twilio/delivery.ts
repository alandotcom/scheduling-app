import twilio from "twilio";
import { authBaseUrl } from "../../../config.js";
import {
  assertActionType,
  JourneyDeliveryNonRetryableError,
  resolveTestModeResult,
  type JourneyDeliveryDispatchInput,
  type JourneyDeliveryDispatchResult,
} from "../../delivery-dispatch-helpers.js";
import { loadDeliveryTemplateContext } from "../../journey-template-context.js";
import { resolveTemplateString } from "../../template-resolution.js";
import {
  getAppIntegrationSecretsForOrg,
  getAppIntegrationStateForOrg,
} from "../readiness.js";

export type TwilioCredentials = {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
};

type TwilioDispatcherDependencies = {
  resolveTestRecipient?: (orgId: string) => Promise<string | null>;
  resolveCredentials?: (orgId: string) => Promise<TwilioCredentials>;
  resolveStatusCallbackUrl?: (input: {
    orgId: string;
    journeyDeliveryId: string;
  }) => string;
  loadTemplateContext?: (input: {
    orgId: string;
    appointmentId: string;
  }) => Promise<Record<string, unknown>>;
  sendTimeoutMs?: number;
  sendMessage?: (input: {
    accountSid: string;
    authToken: string;
    messagingServiceSid: string;
    to: string;
    body: string;
    statusCallback: string;
  }) => Promise<{ sid: string }>;
};

const E164_RE = /^\+[1-9][0-9]{1,14}$/;
const MESSAGING_SERVICE_SID_RE = /^MG[0-9a-zA-Z]{32}$/;
const DEFAULT_TWILIO_SEND_TIMEOUT_MS = 10_000;
const { RestException } = twilio;

function normalizePhoneValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return E164_RE.test(normalized) ? normalized : null;
}

function normalizeMessagingServiceSid(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return MESSAGING_SERVICE_SID_RE.test(normalized) ? normalized : null;
}

async function resolveTwilioIntegrationTestRecipient(
  orgId: string,
): Promise<string | null> {
  const integrationState = await getAppIntegrationStateForOrg(orgId, "twilio");
  return normalizePhoneValue(integrationState.config["testRecipientPhone"]);
}

export async function resolveTwilioCredentialsForOrg(
  orgId: string,
): Promise<TwilioCredentials> {
  const [integrationState, secrets] = await Promise.all([
    getAppIntegrationStateForOrg(orgId, "twilio"),
    getAppIntegrationSecretsForOrg({ orgId, key: "twilio" }),
  ]);

  if (!integrationState.enabled) {
    throw new JourneyDeliveryNonRetryableError(
      "Twilio integration is disabled for this organization. Enable the integration before sending SMS.",
    );
  }

  const accountSid =
    typeof secrets["accountSid"] === "string"
      ? secrets["accountSid"].trim()
      : "";
  const authToken =
    typeof secrets["authToken"] === "string" ? secrets["authToken"].trim() : "";
  const messagingServiceSid = normalizeMessagingServiceSid(
    integrationState.config["messagingServiceSid"],
  );

  if (!accountSid || !authToken || !messagingServiceSid) {
    throw new JourneyDeliveryNonRetryableError(
      "Twilio integration is not fully configured. Expected accountSid, authToken, and messagingServiceSid.",
    );
  }

  return {
    accountSid,
    authToken,
    messagingServiceSid,
  };
}

export function buildTwilioStatusCallbackUrl(input: {
  orgId: string;
  journeyDeliveryId: string;
  baseUrl?: string;
}): string {
  const base = input.baseUrl ?? authBaseUrl;
  const callbackUrl = new URL(
    `/api/integrations/twilio/status-callback/${encodeURIComponent(input.orgId)}/${encodeURIComponent(input.journeyDeliveryId)}`,
    base,
  );
  return callbackUrl.toString();
}

async function sendTwilioMessage(input: {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
  to: string;
  body: string;
  statusCallback: string;
}): Promise<{ sid: string }> {
  const client = twilio(input.accountSid, input.authToken);
  const message = await client.messages.create({
    to: input.to,
    body: input.body,
    messagingServiceSid: input.messagingServiceSid,
    statusCallback: input.statusCallback,
  });
  const sid = typeof message.sid === "string" ? message.sid.trim() : "";
  if (!sid) {
    throw new Error("Twilio API response did not include a message SID.");
  }

  return { sid };
}

function isRetryableTwilioRestException(
  error: InstanceType<typeof RestException>,
): boolean {
  const status = typeof error.status === "number" ? error.status : Number.NaN;
  if (Number.isFinite(status) && status >= 500) {
    return true;
  }

  return status === 429;
}

async function sendTwilioMessageWithTimeout(
  sendMessagePromise: Promise<{ sid: string }>,
  timeoutMs: number,
): Promise<{ sid: string }> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Twilio send timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([sendMessagePromise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

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

  const loadContext =
    dependencies.loadTemplateContext ?? loadDeliveryTemplateContext;
  const context = input.appointmentId
    ? await loadContext({
        orgId: input.orgId,
        appointmentId: input.appointmentId,
      })
    : {};
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
    "@Appointment.data.client.phone",
    context,
  );
  const recipient = normalizePhoneValue(explicitRecipient ?? fallbackRecipient);
  if (!recipient) {
    throw new JourneyDeliveryNonRetryableError(
      "Twilio SMS recipient is missing or invalid. Use E.164 format (for example +14155552671).",
    );
  }

  const resolveCredentials =
    dependencies.resolveCredentials ?? resolveTwilioCredentialsForOrg;
  const credentials = await resolveCredentials(input.orgId);

  const resolveStatusCallbackUrl =
    dependencies.resolveStatusCallbackUrl ??
    ((callbackInput: { orgId: string; journeyDeliveryId: string }) =>
      buildTwilioStatusCallbackUrl(callbackInput));
  const statusCallback = resolveStatusCallbackUrl({
    orgId: input.orgId,
    journeyDeliveryId: input.journeyDeliveryId,
  });

  const send = dependencies.sendMessage ?? sendTwilioMessage;
  const sendTimeoutMs = Math.max(
    1,
    dependencies.sendTimeoutMs ?? DEFAULT_TWILIO_SEND_TIMEOUT_MS,
  );

  try {
    const message = await sendTwilioMessageWithTimeout(
      send({
        accountSid: credentials.accountSid,
        authToken: credentials.authToken,
        messagingServiceSid: credentials.messagingServiceSid,
        to: recipient,
        body: messageBody,
        statusCallback,
      }),
      sendTimeoutMs,
    );

    return {
      providerMessageId: `twilio:${message.sid}`,
      reasonCode: null,
      awaitingAsyncCallback: true,
    };
  } catch (error) {
    if (error instanceof RestException) {
      const message = `Twilio API error ${error.code ?? "unknown"}: ${error.message}`;
      if (isRetryableTwilioRestException(error)) {
        throw new Error(message, { cause: error });
      }

      throw new JourneyDeliveryNonRetryableError(message, { cause: error });
    }

    if (error instanceof Error && error.message.includes("timed out")) {
      throw new Error(
        `${error.message} Check Twilio API health and network egress.`,
        { cause: error },
      );
    }

    throw error;
  }
}
