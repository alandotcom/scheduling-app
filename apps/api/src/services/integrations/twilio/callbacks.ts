import twilio from "twilio";
import {
  journeyDeliveries,
  journeyRunStepLogs,
  type journeyDeliveryStatusEnum,
} from "@scheduling/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { withOrg } from "../../../lib/db.js";
import { isRecord } from "../../../lib/type-guards.js";
import {
  appendJourneyRunEvent,
  upsertJourneyRunStepLog,
} from "../../journey-run-artifacts.js";
import { refreshJourneyRunStatus } from "../../journey-run-status.js";

const TWILIO_SUCCESS_STATUSES = new Set(["sent", "delivered", "read"]);
const TWILIO_FAILURE_STATUSES = new Set(["failed", "undelivered", "canceled"]);

type DeliveryStatus = (typeof journeyDeliveryStatusEnum.enumValues)[number];

export type TwilioStatusCallbackPayload = {
  orgId: string;
  journeyDeliveryId: string;
  messageSid: string;
  messageStatus: string;
  errorCode?: string | null;
};

export type TwilioStatusCallbackApplyResult = {
  applied: boolean;
  status: "sent" | "failed" | null;
  reasonCode: string | null;
  detail: string;
};

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

export async function applyTwilioStatusCallback(
  payload: TwilioStatusCallbackPayload,
): Promise<TwilioStatusCallbackApplyResult> {
  const twilioStatus = normalizeTwilioMessageStatus(payload.messageStatus);
  const terminalStatus = toTerminalDeliveryStatus(twilioStatus);
  if (!terminalStatus) {
    return {
      applied: false,
      status: null,
      reasonCode: null,
      detail: `ignored_non_terminal_status:${twilioStatus || "unknown"}`,
    };
  }

  const normalizedMessageSid = normalizeMessageSid(payload.messageSid);
  if (!normalizedMessageSid) {
    return {
      applied: false,
      status: null,
      reasonCode: null,
      detail: "ignored_missing_message_sid",
    };
  }

  const errorCode = normalizeErrorCode(payload.errorCode ?? null);
  const reasonCode =
    terminalStatus === "failed"
      ? toTwilioFailureReasonCode({ twilioStatus, errorCode })
      : null;

  const result = await withOrg(payload.orgId, async (tx) => {
    const [delivery] = await tx
      .select({
        id: journeyDeliveries.id,
        journeyRunId: journeyDeliveries.journeyRunId,
        stepKey: journeyDeliveries.stepKey,
        status: journeyDeliveries.status,
        scheduledFor: journeyDeliveries.scheduledFor,
        reasonCode: journeyDeliveries.reasonCode,
        channel: journeyDeliveries.channel,
      })
      .from(journeyDeliveries)
      .where(eq(journeyDeliveries.id, payload.journeyDeliveryId))
      .limit(1);

    if (!delivery) {
      return {
        applied: false,
        status: null,
        reasonCode: null,
        detail: "ignored_delivery_missing",
        runId: null,
      };
    }

    if (delivery.channel !== "sms") {
      return {
        applied: false,
        status: null,
        reasonCode: null,
        detail: "ignored_non_sms_delivery",
        runId: null,
      };
    }

    if (delivery.status !== "planned") {
      return {
        applied: false,
        status: null,
        reasonCode: delivery.reasonCode,
        detail: `ignored_delivery_already_${delivery.status}`,
        runId: delivery.journeyRunId,
      };
    }

    const [updated] = await tx
      .update(journeyDeliveries)
      .set({
        status: terminalStatus,
        reasonCode,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(journeyDeliveries.id, payload.journeyDeliveryId),
          eq(journeyDeliveries.status, "planned"),
        ),
      )
      .returning({
        id: journeyDeliveries.id,
        journeyRunId: journeyDeliveries.journeyRunId,
        stepKey: journeyDeliveries.stepKey,
        status: journeyDeliveries.status,
        scheduledFor: journeyDeliveries.scheduledFor,
      });

    if (!updated) {
      return {
        applied: false,
        status: null,
        reasonCode: null,
        detail: "ignored_delivery_updated_concurrently",
        runId: delivery.journeyRunId,
      };
    }

    const [existingStepLog] = await tx
      .select({
        input: journeyRunStepLogs.input,
        startedAt: journeyRunStepLogs.startedAt,
      })
      .from(journeyRunStepLogs)
      .where(
        and(
          eq(journeyRunStepLogs.journeyRunId, updated.journeyRunId),
          eq(journeyRunStepLogs.stepKey, updated.stepKey),
        ),
      )
      .limit(1);

    const startedAt = existingStepLog?.startedAt ?? updated.scheduledFor;
    const completedAt = new Date();

    await upsertJourneyRunStepLog({
      tx,
      orgId: payload.orgId,
      runId: updated.journeyRunId,
      stepKey: updated.stepKey,
      nodeType: "send-twilio",
      status: terminalStatus === "sent" ? "success" : "error",
      startedAt,
      completedAt,
      durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      logInput: isRecord(existingStepLog?.input) ? existingStepLog.input : {},
      logOutput: {
        status: terminalStatus,
        reasonCode,
        providerMessageId: `twilio:${normalizedMessageSid}`,
        twilioStatus,
        twilioErrorCode: errorCode,
      },
      error:
        terminalStatus === "failed" ? (reasonCode ?? "provider_error") : null,
    });

    await appendJourneyRunEvent({
      tx,
      orgId: payload.orgId,
      runId: updated.journeyRunId,
      eventType:
        terminalStatus === "sent" ? "delivery_sent" : "delivery_failed",
      message: `Delivery ${updated.stepKey} ${
        terminalStatus === "sent" ? "sent" : "failed"
      }`,
      metadata: {
        stepKey: updated.stepKey,
        reasonCode: terminalStatus === "failed" ? reasonCode : null,
        providerMessageId: `twilio:${normalizedMessageSid}`,
        twilioStatus,
        twilioErrorCode: errorCode,
      },
    });

    return {
      applied: true,
      status: terminalStatus,
      reasonCode,
      detail: `applied_${terminalStatus}`,
      runId: updated.journeyRunId,
    };
  });

  if (result.applied && result.runId) {
    await refreshJourneyRunStatus(payload.orgId, result.runId);
  }

  return {
    applied: result.applied,
    status: result.status,
    reasonCode: result.reasonCode,
    detail: result.detail,
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

export function resolveCallbackQueryParams(input: {
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

export type TwilioDeliveryStatus = DeliveryStatus;
