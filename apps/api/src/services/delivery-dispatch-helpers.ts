import type { JourneyRunMode } from "@scheduling/dto";

type JsonRecord = Record<string, unknown>;

export type JourneyDeliveryDispatchInput = {
  orgId: string;
  journeyRunId: string;
  journeyDeliveryId: string;
  channel: string;
  idempotencyKey: string;
  runMode?: JourneyRunMode;
  stepConfig: JsonRecord;
  triggerEntityType?: "appointment" | "client";
  appointmentId?: string;
  clientId?: string;
};

export type JourneyDeliveryDispatchResult = {
  providerMessageId?: string;
  reasonCode?: string | null;
  awaitingAsyncCallback?: boolean;
};

export type JourneyDeliveryDispatcher = (
  input: JourneyDeliveryDispatchInput,
) => Promise<JourneyDeliveryDispatchResult>;

export class JourneyDeliveryNonRetryableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "JourneyDeliveryNonRetryableError";
  }
}

export function normalizeActionType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

type IntegrationTestBehavior =
  | "log_only"
  | "route_to_integration_test_recipient";

export function resolveIntegrationTestBehavior(
  stepConfig: Record<string, unknown>,
): IntegrationTestBehavior {
  const raw = normalizeActionType(stepConfig["testBehavior"]);
  if (raw === "route_to_integration_test_recipient") {
    return raw;
  }

  return "log_only";
}

export function assertActionType(
  input: JourneyDeliveryDispatchInput,
  ...allowedTypes: string[]
): void {
  const actionType = normalizeActionType(input.stepConfig["actionType"]);
  if (actionType && allowedTypes.includes(actionType)) {
    return;
  }

  throw new JourneyDeliveryNonRetryableError(
    `Action type mismatch. Expected one of: ${allowedTypes.join(", ")}.`,
  );
}

export async function resolveTestModeResult(input: {
  providerKey: string;
  idempotencyKey: string;
  stepConfig: Record<string, unknown>;
  runMode: JourneyRunMode;
  orgId: string;
  resolveTestRecipient?: (orgId: string) => Promise<string | null>;
}): Promise<JourneyDeliveryDispatchResult | null> {
  if (input.runMode !== "test") {
    return null;
  }

  const testBehavior = resolveIntegrationTestBehavior(input.stepConfig);
  if (
    testBehavior === "route_to_integration_test_recipient" &&
    input.resolveTestRecipient
  ) {
    const recipient = await input.resolveTestRecipient(input.orgId);
    if (recipient) {
      return {
        providerMessageId: `${input.providerKey}:test-recipient:${input.idempotencyKey}`,
        reasonCode: "test_mode_routed_integration_recipient",
      };
    }

    return {
      providerMessageId: `${input.providerKey}:test-log-fallback:${input.idempotencyKey}`,
      reasonCode: "test_mode_log_fallback_missing_recipient",
    };
  }

  return {
    providerMessageId: `${input.providerKey}:test-log-only:${input.idempotencyKey}`,
    reasonCode: "test_mode_log_only",
  };
}
