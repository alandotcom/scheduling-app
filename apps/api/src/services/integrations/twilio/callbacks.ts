import twilio from "twilio";

// Pure Twilio status-callback handling: signature validation, body/path parsing,
// and mapping a Twilio message status into a channel-neutral delivery outcome.
// No journey imports and no DB — the journey domain's recordDeliveryOutcome
// applies the mapped outcome to the run projection.

const TWILIO_SUCCESS_STATUSES = new Set(["sent", "delivered", "read"]);
const TWILIO_FAILURE_STATUSES = new Set(["failed", "undelivered", "canceled"]);

export type TwilioStatusCallbackPayload = {
  orgId: string;
  journeyDeliveryId: string;
  messageSid: string;
  messageStatus: string;
  errorCode?: string | null;
};

export type TwilioCallbackMapping =
  | {
      kind: "terminal";
      status: "sent" | "failed";
      providerMessageId: string;
      reasonCode: string | null;
      providerMetadata: {
        twilioStatus: string;
        twilioErrorCode: string | null;
      };
    }
  | { kind: "ignored"; detail: string };

function normalizeTwilioMessageStatus(status: string): string {
  return status.trim().toLowerCase();
}

function normalizeMessageSid(messageSid: string): string {
  return messageSid.trim();
}

function normalizeErrorCode(
  errorCode: string | null | undefined,
): string | null {
  if (typeof errorCode !== "string") {
    return null;
  }

  const normalized = errorCode.trim();
  return normalized.length > 0 ? normalized : null;
}

function toTwilioFailureReasonCode(input: {
  twilioStatus: string;
  errorCode: string | null;
}): string {
  const normalizedStatus =
    input.twilioStatus.trim().length > 0 ? input.twilioStatus : "unknown";

  if (!input.errorCode) {
    return `twilio_status:${normalizedStatus}`;
  }

  return `twilio_status:${normalizedStatus}:error_${input.errorCode}`;
}

function toTerminalDeliveryStatus(
  twilioStatus: string,
): "sent" | "failed" | null {
  if (TWILIO_SUCCESS_STATUSES.has(twilioStatus)) {
    return "sent";
  }

  if (TWILIO_FAILURE_STATUSES.has(twilioStatus)) {
    return "failed";
  }

  return null;
}

export function validateTwilioStatusCallbackSignature(input: {
  authToken: string;
  signature: string;
  url: string;
  params: Record<string, string>;
}): boolean {
  return twilio.validateRequest(
    input.authToken,
    input.signature,
    input.url,
    input.params,
  );
}

// Map a Twilio status callback to a channel-neutral delivery outcome. Returns
// `ignored` for non-terminal statuses or a missing SID; otherwise a terminal
// sent/failed outcome the journey reducer can apply.
export function mapTwilioStatusCallback(
  payload: TwilioStatusCallbackPayload,
): TwilioCallbackMapping {
  const twilioStatus = normalizeTwilioMessageStatus(payload.messageStatus);
  const terminalStatus = toTerminalDeliveryStatus(twilioStatus);
  if (!terminalStatus) {
    return {
      kind: "ignored",
      detail: `ignored_non_terminal_status:${twilioStatus || "unknown"}`,
    };
  }

  const normalizedMessageSid = normalizeMessageSid(payload.messageSid);
  if (!normalizedMessageSid) {
    return { kind: "ignored", detail: "ignored_missing_message_sid" };
  }

  const errorCode = normalizeErrorCode(payload.errorCode ?? null);
  const reasonCode =
    terminalStatus === "failed"
      ? toTwilioFailureReasonCode({ twilioStatus, errorCode })
      : null;

  return {
    kind: "terminal",
    status: terminalStatus,
    providerMessageId: `twilio:${normalizedMessageSid}`,
    reasonCode,
    providerMetadata: { twilioStatus, twilioErrorCode: errorCode },
  };
}

export function parseTwilioStatusCallbackBody(body: Record<string, string>): {
  messageSid: string | null;
  messageStatus: string | null;
  errorCode: string | null;
} {
  const messageSidRaw = body["MessageSid"] ?? body["SmsSid"];
  const messageStatusRaw = body["MessageStatus"] ?? body["SmsStatus"];
  const errorCodeRaw = body["ErrorCode"];

  const messageSid =
    typeof messageSidRaw === "string" && messageSidRaw.trim().length > 0
      ? messageSidRaw.trim()
      : null;
  const messageStatus =
    typeof messageStatusRaw === "string" && messageStatusRaw.trim().length > 0
      ? messageStatusRaw.trim()
      : null;
  const errorCode = normalizeErrorCode(errorCodeRaw ?? null);

  return {
    messageSid,
    messageStatus,
    errorCode,
  };
}

export function resolveCallbackPathParams(input: {
  orgId: string | undefined;
  journeyDeliveryId: string | undefined;
}): { orgId: string | null; journeyDeliveryId: string | null } {
  const orgId =
    typeof input.orgId === "string" && input.orgId.trim().length > 0
      ? input.orgId.trim()
      : null;
  const journeyDeliveryId =
    typeof input.journeyDeliveryId === "string" &&
    input.journeyDeliveryId.trim().length > 0
      ? input.journeyDeliveryId.trim()
      : null;

  return {
    orgId,
    journeyDeliveryId,
  };
}
