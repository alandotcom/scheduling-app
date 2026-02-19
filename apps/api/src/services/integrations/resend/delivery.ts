import {
  assertActionType,
  resolveTestModeResult,
  type JourneyDeliveryDispatchInput,
  type JourneyDeliveryDispatchResult,
} from "../../delivery-dispatch-helpers.js";
import { getAppIntegrationStateForOrg } from "../readiness.js";

type ResendDispatcherDependencies = {
  resolveTestRecipient?: (orgId: string) => Promise<string | null>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmailValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return EMAIL_RE.test(normalized) ? normalized : null;
}

async function resolveResendIntegrationTestRecipient(
  orgId: string,
): Promise<string | null> {
  const integrationState = await getAppIntegrationStateForOrg(orgId, "resend");
  return normalizeEmailValue(integrationState.config["testRecipientEmail"]);
}

export async function dispatchJourneySendResendAction(
  input: JourneyDeliveryDispatchInput,
  dependencies: ResendDispatcherDependencies = {},
): Promise<JourneyDeliveryDispatchResult> {
  assertActionType(input, "send-resend", "send-resend-template");

  const testResult = await resolveTestModeResult({
    providerKey: "resend",
    idempotencyKey: input.idempotencyKey,
    stepConfig: input.stepConfig,
    runMode: input.runMode ?? "live",
    orgId: input.orgId,
    resolveTestRecipient:
      dependencies.resolveTestRecipient ??
      resolveResendIntegrationTestRecipient,
  });
  if (testResult) {
    return testResult;
  }

  return {
    providerMessageId: `resend:${input.idempotencyKey}`,
    reasonCode: null,
  };
}
