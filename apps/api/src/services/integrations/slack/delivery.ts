import {
  assertActionType,
  resolveTestModeResult,
  type JourneyDeliveryDispatchInput,
  type JourneyDeliveryDispatchResult,
} from "../../delivery-dispatch-helpers.js";

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

  return {
    providerMessageId: `slack:${input.idempotencyKey}`,
    reasonCode: null,
  };
}
