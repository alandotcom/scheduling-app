import type {
  JourneyDeliveryDispatchInput,
  JourneyDeliveryDispatchResult,
} from "./journey-delivery-adapters.js";
import { getAppIntegrationStateForOrg } from "./integrations/readiness.js";

type SupportedIntegrationActionType =
  | "send-resend"
  | "send-resend-template"
  | "send-slack";

type ResendTestBehavior = "log_only" | "route_to_integration_test_recipient";

type ResendDispatcherDependencies = {
  resolveTestRecipient?: (orgId: string) => Promise<string | null>;
};

function normalizeActionType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  return normalized;
}

function resolveIntegrationActionType(
  stepConfig: Record<string, unknown>,
): SupportedIntegrationActionType | null {
  const actionType = normalizeActionType(stepConfig["actionType"]);
  if (
    actionType === "send-resend" ||
    actionType === "send-resend-template" ||
    actionType === "send-slack"
  ) {
    return actionType;
  }

  return null;
}

function resolveResendTestBehavior(
  stepConfig: Record<string, unknown>,
): ResendTestBehavior {
  const raw = normalizeActionType(stepConfig["testBehavior"]);
  if (raw === "route_to_integration_test_recipient") {
    return raw;
  }

  return "log_only";
}

function normalizeEmailValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

async function resolveResendIntegrationTestRecipient(
  orgId: string,
): Promise<string | null> {
  const integrationState = await getAppIntegrationStateForOrg(orgId, "resend");
  return normalizeEmailValue(integrationState.config["testRecipientEmail"]);
}

function assertActionType(
  input: JourneyDeliveryDispatchInput,
  expected: SupportedIntegrationActionType | SupportedIntegrationActionType[],
): void {
  const actionType = resolveIntegrationActionType(input.stepConfig);
  const expectedSet = Array.isArray(expected) ? expected : [expected];

  if (actionType && expectedSet.includes(actionType)) {
    return;
  }

  throw new Error(
    `Action type mismatch for integration dispatcher. Expected ${expectedSet.join(", ")}.`,
  );
}

// TODO(integrations-webhooks): Add provider webhook lifecycle wiring so these
// dispatchers can advance from accepted-send completion to delivery-confirmed
// completion. This likely belongs in provider-owned integration webhook routes
// with programmatic self-registration support (for example, Resend create webhook).

export async function dispatchJourneySendResendAction(
  input: JourneyDeliveryDispatchInput,
  dependencies: ResendDispatcherDependencies = {},
): Promise<JourneyDeliveryDispatchResult> {
  assertActionType(input, ["send-resend", "send-resend-template"]);

  const runMode = input.runMode ?? "live";
  if (runMode === "test") {
    const testBehavior = resolveResendTestBehavior(input.stepConfig);
    if (testBehavior === "route_to_integration_test_recipient") {
      const resolveTestRecipient =
        dependencies.resolveTestRecipient ??
        resolveResendIntegrationTestRecipient;
      const recipient = await resolveTestRecipient(input.orgId);
      if (recipient) {
        return {
          providerMessageId: `resend:test-recipient:${input.idempotencyKey}`,
          reasonCode: "test_mode_routed_integration_recipient",
        };
      }

      return {
        providerMessageId: `resend:test-log-fallback:${input.idempotencyKey}`,
        reasonCode: "test_mode_log_fallback_missing_recipient",
      };
    }

    return {
      providerMessageId: `resend:test-log-only:${input.idempotencyKey}`,
      reasonCode: "test_mode_log_only",
    };
  }

  return {
    providerMessageId: `resend:${input.idempotencyKey}`,
    reasonCode: null,
  };
}

export async function dispatchJourneySendSlackAction(
  input: JourneyDeliveryDispatchInput,
): Promise<JourneyDeliveryDispatchResult> {
  assertActionType(input, "send-slack");

  const runMode = input.runMode ?? "live";
  if (runMode === "test") {
    return {
      providerMessageId: `slack:test-log-only:${input.idempotencyKey}`,
      reasonCode: "test_mode_log_only",
    };
  }

  return {
    providerMessageId: `slack:${input.idempotencyKey}`,
    reasonCode: null,
  };
}
