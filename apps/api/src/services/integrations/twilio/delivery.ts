import twilio from "twilio";
import { authBaseUrl } from "../../../config.js";
import { ProviderSendError } from "../provider-send-error.js";
import {
  getAppIntegrationSecretsForOrg,
  getAppIntegrationStateForOrg,
} from "../readiness.js";

// Thin Twilio SMS adapter. It knows only how to talk to Twilio: resolve org
// credentials, send a message, and classify Twilio failures as retryable or not.
// It has NO journey imports — the journey delivery dispatcher renders the body,
// resolves the recipient, and translates a non-retryable ProviderSendError into
// the journey's own non-retryable signal.

export type TwilioCredentials = {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  authToken: string;
  messagingServiceSid: string;
};

type TwilioSendDependencies = {
  resolveCredentials?: (orgId: string) => Promise<TwilioCredentials>;
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

const E164_RE = /^\+[1-9][0-9]{1,14}$/;
const MESSAGING_SERVICE_SID_RE = /^MG[0-9a-zA-Z]{32}$/;
const DEFAULT_TWILIO_SEND_TIMEOUT_MS = 10_000;
const { RestException } = twilio;

export function normalizeTwilioPhone(value: unknown): string | null {
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

export async function resolveTwilioIntegrationTestRecipient(
  orgId: string,
): Promise<string | null> {
  const integrationState = await getAppIntegrationStateForOrg(orgId, "twilio");
  return normalizeTwilioPhone(integrationState.config["testRecipientPhone"]);
}

export async function resolveTwilioCredentialsForOrg(
  orgId: string,
): Promise<TwilioCredentials> {
  const [integrationState, secrets] = await Promise.all([
    getAppIntegrationStateForOrg(orgId, "twilio"),
    getAppIntegrationSecretsForOrg({ orgId, key: "twilio" }),
  ]);

  if (!integrationState.enabled) {
    throw new ProviderSendError(
      "Twilio integration is disabled for this organization. Enable the integration before sending SMS.",
      { retryable: false },
    );
  }

  const accountSid =
    typeof secrets["accountSid"] === "string"
      ? secrets["accountSid"].trim()
      : "";
  const apiKeySid =
    typeof secrets["apiKeySid"] === "string" ? secrets["apiKeySid"].trim() : "";
  const apiKeySecret =
    typeof secrets["apiKeySecret"] === "string"
      ? secrets["apiKeySecret"].trim()
      : "";
  const authToken =
    typeof secrets["authToken"] === "string" ? secrets["authToken"].trim() : "";
  const messagingServiceSid = normalizeMessagingServiceSid(
    integrationState.config["messagingServiceSid"],
  );

  if (
    !accountSid ||
    !apiKeySid ||
    !apiKeySecret ||
    !authToken ||
    !messagingServiceSid
  ) {
    throw new ProviderSendError(
      "Twilio integration is not fully configured. Expected accountSid, apiKeySid, apiKeySecret, authToken, and messagingServiceSid.",
      { retryable: false },
    );
  }

  return {
    accountSid,
    apiKeySid,
    apiKeySecret,
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
  apiKeySid: string;
  apiKeySecret: string;
  messagingServiceSid: string;
  to: string;
  body: string;
  statusCallback: string;
}): Promise<{ sid: string }> {
  const client = twilio(input.apiKeySid, input.apiKeySecret, {
    accountSid: input.accountSid,
  });
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

// Send one SMS. `to` must already be a valid E.164 number (the dispatcher
// validates it). Throws ProviderSendError on a Twilio/network failure with the
// retryability the journey retry loop should honor.
export async function sendTwilioSms(
  input: {
    orgId: string;
    to: string;
    body: string;
    statusCallbackUrl: string;
  },
  dependencies: TwilioSendDependencies = {},
): Promise<{ providerMessageId: string }> {
  const resolveCredentials =
    dependencies.resolveCredentials ?? resolveTwilioCredentialsForOrg;
  const credentials = await resolveCredentials(input.orgId);

  const send = dependencies.sendMessage ?? sendTwilioMessage;
  const sendTimeoutMs = Math.max(
    1,
    dependencies.sendTimeoutMs ?? DEFAULT_TWILIO_SEND_TIMEOUT_MS,
  );

  try {
    const message = await sendTwilioMessageWithTimeout(
      send({
        accountSid: credentials.accountSid,
        apiKeySid: credentials.apiKeySid,
        apiKeySecret: credentials.apiKeySecret,
        messagingServiceSid: credentials.messagingServiceSid,
        to: input.to,
        body: input.body,
        statusCallback: input.statusCallbackUrl,
      }),
      sendTimeoutMs,
    );

    return { providerMessageId: `twilio:${message.sid}` };
  } catch (error) {
    if (error instanceof RestException) {
      const message = `Twilio API error ${error.code ?? "unknown"}: ${error.message}`;
      throw new ProviderSendError(message, {
        retryable: isRetryableTwilioRestException(error),
        cause: error,
      });
    }

    if (error instanceof Error && error.message.includes("timed out")) {
      throw new ProviderSendError(
        `${error.message} Check Twilio API health and network egress.`,
        { retryable: true, cause: error },
      );
    }

    throw error;
  }
}
