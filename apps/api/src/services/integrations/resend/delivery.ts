import { Resend, type CreateEmailOptions } from "resend";
import { ProviderSendError } from "../provider-send-error.js";
import {
  getAppIntegrationSecretsForOrg,
  getAppIntegrationStateForOrg,
} from "../readiness.js";

// Thin Resend email adapter. It knows only how to talk to Resend: resolve org
// config, send a payload (forwarding the idempotency key for provider-side
// dedup), and classify Resend failures. No journey imports — the journey
// delivery dispatcher renders the body/recipients and builds the payload.

export type ResendIntegrationConfig = {
  apiKey: string;
  defaultFromAddress: string;
  defaultFromName: string | null;
  defaultReplyTo: string | null;
};

export type ResendSendPayload = {
  from: string;
  to: string | string[];
} & CreateEmailOptions;

export type ResendSendEmailInput = {
  apiKey: string;
  payload: ResendSendPayload;
  idempotencyKey?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeEmailValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return EMAIL_RE.test(normalized) ? normalized : null;
}

export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (isRecord(error) && typeof error["message"] === "string") {
    const message = error["message"].trim();
    if (message.length > 0) {
      return message;
    }
  }
  return "Unknown error";
}

function getErrorStatusCode(error: unknown): number | null {
  if (isRecord(error)) {
    if (typeof error["statusCode"] === "number") {
      return error["statusCode"];
    }
    if (typeof error["status"] === "number") {
      return error["status"];
    }
  }
  return null;
}

function isNonRetryableStatusCode(statusCode: number | null): boolean {
  if (statusCode === null) {
    return false;
  }
  return statusCode >= 400 && statusCode < 500 && statusCode !== 429;
}

export async function resolveResendIntegrationTestRecipient(
  orgId: string,
): Promise<string | null> {
  const integrationState = await getAppIntegrationStateForOrg(orgId, "resend");
  return normalizeEmailValue(integrationState.config["testRecipientEmail"]);
}

export async function resolveResendConfigForOrg(
  orgId: string,
): Promise<ResendIntegrationConfig> {
  const [integrationState, secrets] = await Promise.all([
    getAppIntegrationStateForOrg(orgId, "resend"),
    getAppIntegrationSecretsForOrg({ orgId, key: "resend" }),
  ]);

  if (!integrationState.enabled) {
    throw new ProviderSendError(
      "Resend integration is disabled for this organization. Enable the integration before sending email.",
      { retryable: false },
    );
  }

  const apiKey = normalizeOptionalString(secrets["apiKey"]);
  const defaultFromAddress = normalizeEmailValue(
    integrationState.config["fromEmail"],
  );
  const defaultFromName = normalizeOptionalString(
    integrationState.config["fromName"],
  );
  const defaultReplyTo = normalizeEmailValue(
    integrationState.config["replyTo"],
  );

  if (!apiKey || !defaultFromAddress) {
    throw new ProviderSendError(
      "Resend integration is not fully configured. Expected apiKey and fromEmail.",
      { retryable: false },
    );
  }

  return {
    apiKey,
    defaultFromAddress,
    defaultFromName,
    defaultReplyTo,
  };
}

export async function sendResendEmail(
  input: ResendSendEmailInput,
): Promise<{ providerMessageId: string }> {
  const resend = new Resend(input.apiKey);

  let response: Awaited<ReturnType<typeof resend.emails.send>> | undefined =
    undefined;
  try {
    // The deterministic delivery key is stable across retries, so passing it as
    // the Resend idempotency key lets the provider dedupe a re-dispatch.
    response = await resend.emails.send(
      input.payload,
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {},
    );
  } catch (error) {
    throw new ProviderSendError(getErrorMessage(error), {
      retryable: !isNonRetryableStatusCode(getErrorStatusCode(error)),
      cause: error,
    });
  }

  if (!response) {
    throw new ProviderSendError("Resend send returned no response.", {
      retryable: true,
    });
  }

  if (response.error) {
    throw new ProviderSendError(getErrorMessage(response.error), {
      retryable: !isNonRetryableStatusCode(getErrorStatusCode(response.error)),
      cause: response.error,
    });
  }

  const providerMessageId =
    typeof response.data?.id === "string" ? response.data.id.trim() : "";
  if (!providerMessageId) {
    throw new ProviderSendError(
      "Resend API response did not include an email id.",
      { retryable: true },
    );
  }

  return { providerMessageId: `resend:${providerMessageId}` };
}
