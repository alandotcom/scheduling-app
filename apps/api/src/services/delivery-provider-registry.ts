import { getLogger } from "@logtape/logtape";
import type { ProviderExecuteEventName } from "../inngest/client.js";
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

type InngestRetryCount =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20;

type DeliveryProviderEventName =
  | ProviderExecuteEventName
  | "journey.delivery.scheduled";

export type DeliveryProviderSpec = {
  key: string;
  actionTypes: readonly string[];
  channel: string;
  eventName: DeliveryProviderEventName;
  functionId: string;
  retries: InngestRetryCount;
  maxDispatchAttempts: number;
  perFunctionConcurrency: {
    key: string;
    scope: "env" | "fn" | "account";
    limit: number;
  };
  dispatch: JourneyDeliveryDispatcher;
};

const providers: DeliveryProviderSpec[] = [
  {
    key: "resend",
    actionTypes: ["send-resend", "send-resend-template"],
    channel: "email",
    eventName: "journey.action.send-resend.execute",
    functionId: "journey-action-send-resend-execute",
    retries: 2,
    maxDispatchAttempts: 2,
    perFunctionConcurrency: {
      key: "event.data.orgId",
      scope: "fn",
      limit: 10,
    },
    dispatch: dispatchJourneySendResendAction,
  },
  {
    key: "slack",
    actionTypes: ["send-slack"],
    channel: "slack",
    eventName: "journey.action.send-slack.execute",
    functionId: "journey-action-send-slack-execute",
    retries: 2,
    maxDispatchAttempts: 2,
    perFunctionConcurrency: {
      key: "event.data.orgId",
      scope: "fn",
      limit: 10,
    },
    dispatch: dispatchJourneySendSlackAction,
  },
  {
    key: "twilio",
    actionTypes: ["send-twilio"],
    channel: "sms",
    eventName: "journey.action.send-twilio.execute",
    functionId: "journey-action-send-twilio-execute",
    retries: 0,
    maxDispatchAttempts: 1,
    perFunctionConcurrency: {
      key: "event.data.orgId",
      scope: "fn",
      limit: 10,
    },
    dispatch: dispatchJourneySendTwilioAction,
  },
  {
    key: "logger",
    actionTypes: ["logger"],
    channel: "logger",
    eventName: "journey.delivery.scheduled",
    functionId: "journey-delivery-scheduled",
    retries: 2,
    maxDispatchAttempts: 2,
    perFunctionConcurrency: {
      key: "event.data.orgId",
      scope: "fn",
      limit: 20,
    },
    dispatch: dispatchLoggerDelivery,
  },
  {
    key: "wait-resume",
    actionTypes: ["wait-resume"],
    channel: "internal",
    eventName: "journey.wait-resume.execute",
    functionId: "journey-wait-resume-execute",
    retries: 2,
    maxDispatchAttempts: 1,
    perFunctionConcurrency: {
      key: "event.data.orgId",
      scope: "fn",
      limit: 10,
    },
    dispatch: () => {
      throw new Error(
        "wait-resume deliveries are intercepted before dispatch; this should never be called.",
      );
    },
  },
  {
    key: "wait-for-confirmation-timeout",
    actionTypes: ["wait-for-confirmation-timeout"],
    channel: "internal",
    eventName: "journey.wait-for-confirmation-timeout.execute",
    functionId: "journey-wait-for-confirmation-timeout-execute",
    retries: 2,
    maxDispatchAttempts: 1,
    perFunctionConcurrency: {
      key: "event.data.orgId",
      scope: "fn",
      limit: 10,
    },
    dispatch: () => {
      throw new Error(
        "wait-for-confirmation-timeout deliveries are intercepted before dispatch; this should never be called.",
      );
    },
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

export const deliveryProviders: readonly DeliveryProviderSpec[] = providers;

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
