import type {
  JourneyDeliveryDispatchInput,
  JourneyDeliveryDispatchResult,
} from "./journey-delivery-adapters.js";

type SupportedIntegrationActionType =
  | "send-resend"
  | "send-resend-template"
  | "send-slack";

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
): Promise<JourneyDeliveryDispatchResult> {
  assertActionType(input, ["send-resend", "send-resend-template"]);

  return {
    providerMessageId: `resend:${input.idempotencyKey}`,
  };
}

export async function dispatchJourneySendSlackAction(
  input: JourneyDeliveryDispatchInput,
): Promise<JourneyDeliveryDispatchResult> {
  assertActionType(input, "send-slack");

  return {
    providerMessageId: `slack:${input.idempotencyKey}`,
  };
}
