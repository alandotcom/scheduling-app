import { getLogger } from "@logtape/logtape";
import {
  normalizeActionType,
  type JourneyDeliveryDispatchInput,
  type JourneyDeliveryDispatchResult,
  type JourneyDeliveryDispatcher,
} from "./delivery-dispatch-helpers.js";
import { dispatchJourneySendResendAction } from "./integrations/resend/delivery.js";
import { dispatchJourneySendSlackAction } from "./integrations/slack/delivery.js";
import { dispatchJourneySendTwilioAction } from "./integrations/twilio/delivery.js";

const journeyLoggerDeliverySink = getLogger([
  "journeys",
  "delivery-worker",
  "logger",
]);

async function dispatchLoggerDelivery(
  input: JourneyDeliveryDispatchInput,
): Promise<JourneyDeliveryDispatchResult> {
  const sinkRecord = {
    orgId: input.orgId,
    journeyRunId: input.journeyRunId,
    journeyDeliveryId: input.journeyDeliveryId,
    channel: "logger" as const,
    idempotencyKey: input.idempotencyKey,
    runMode: input.runMode ?? "live",
    stepConfig: input.stepConfig,
  };

  journeyLoggerDeliverySink.info(
    "Journey logger delivery executed {journeyDeliveryId}",
    sinkRecord,
  );
  console.info("[journey-logger-delivery]", sinkRecord);

  return {
    providerMessageId: `logger:${input.idempotencyKey}`,
    reasonCode:
      (input.runMode ?? "live") === "test" ? "test_mode_log_only" : null,
  };
}

// A delivery provider for one channel. The journey-run executor dispatches sends
// through `dispatch`, derives the channel hint from `channel`, and uses
// `maxDispatchAttempts` to bound in-step retries (Twilio is 1 since the real
// status arrives via an async callback, so a retry would risk a double-send).
export type DeliveryProviderSpec = {
  key: string;
  actionTypes: readonly string[];
  channel: string;
  maxDispatchAttempts: number;
  dispatch: JourneyDeliveryDispatcher;
};

const providers: DeliveryProviderSpec[] = [
  {
    key: "resend",
    actionTypes: ["send-resend", "send-resend-template"],
    channel: "email",
    maxDispatchAttempts: 2,
    dispatch: dispatchJourneySendResendAction,
  },
  {
    key: "slack",
    actionTypes: ["send-slack"],
    channel: "slack",
    maxDispatchAttempts: 2,
    dispatch: dispatchJourneySendSlackAction,
  },
  {
    key: "twilio",
    actionTypes: ["send-twilio"],
    channel: "sms",
    maxDispatchAttempts: 1,
    dispatch: dispatchJourneySendTwilioAction,
  },
  {
    key: "logger",
    actionTypes: ["logger"],
    channel: "logger",
    maxDispatchAttempts: 2,
    dispatch: dispatchLoggerDelivery,
  },
];

const actionTypeToProvider = new Map<string, DeliveryProviderSpec>();
for (const provider of providers) {
  for (const actionType of provider.actionTypes) {
    actionTypeToProvider.set(actionType, provider);
  }
}

export function getProviderForActionType(
  actionType: string,
): DeliveryProviderSpec | undefined {
  return actionTypeToProvider.get(actionType);
}

export const deliveryActionTypes: readonly string[] = providers.flatMap(
  (p) => p.actionTypes,
);

export const SHARED_ORG_CONCURRENCY = {
  key: '"journey-delivery:" + event.data.orgId',
  scope: "env",
  limit: 20,
} as const;

export const TWILIO_CALLBACK_ORG_CONCURRENCY = {
  key: "event.data.orgId",
  scope: "fn",
  limit: 10,
} as const;

export async function dispatchForActionType(
  input: JourneyDeliveryDispatchInput,
): Promise<JourneyDeliveryDispatchResult> {
  const actionType = normalizeActionType(input.stepConfig["actionType"]);
  if (!actionType) {
    throw new Error(
      "Cannot dispatch delivery: missing or invalid actionType in stepConfig.",
    );
  }

  const provider = actionTypeToProvider.get(actionType);
  if (!provider) {
    throw new Error(`Unsupported delivery action type "${actionType}".`);
  }

  return provider.dispatch(input);
}
