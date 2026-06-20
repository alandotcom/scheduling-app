import {
  assertActionType,
  resolveTestModeResult,
  type JourneyDeliveryDispatchInput,
  type JourneyDeliveryDispatchResult,
} from "./delivery-dispatch-helpers.js";
import { sendSlackMessage } from "../integrations/slack/delivery.js";

// Journey-side Slack dispatcher: action-type + test-mode handling, then calls
// DOWN into the thin Slack adapter.
export async function dispatchJourneySendSlackAction(
  input: JourneyDeliveryDispatchInput,
): Promise<JourneyDeliveryDispatchResult> {
  assertActionType(input, "send-slack");

  const testResult = await resolveTestModeResult({
    providerKey: "slack",
    idempotencyKey: input.idempotencyKey,
    stepConfig: input.stepConfig,
    runMode: input.runMode ?? "live",
    orgId: input.orgId,
  });
  if (testResult) {
    return testResult;
  }

  const sent = await sendSlackMessage({ idempotencyKey: input.idempotencyKey });

  return {
    providerMessageId: sent.providerMessageId,
    reasonCode: null,
  };
}
