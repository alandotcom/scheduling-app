import { getLogger } from "@logtape/logtape";
import type { JourneyRunMode } from "@scheduling/dto";

type JsonRecord = Record<string, unknown>;

const journeyLoggerDeliverySink = getLogger([
  "journeys",
  "delivery-worker",
  "logger",
]);

export type JourneyDeliveryDispatchInput = {
  orgId: string;
  journeyRunId: string;
  journeyDeliveryId: string;
  channel: string;
  idempotencyKey: string;
  runMode?: JourneyRunMode;
  stepConfig: JsonRecord;
};

export type JourneyDeliveryDispatchResult = {
  providerMessageId?: string;
  reasonCode?: string | null;
};

export type JourneyLoggerDeliveryRecord = {
  orgId: string;
  journeyRunId: string;
  journeyDeliveryId: string;
  channel: "logger";
  idempotencyKey: string;
  runMode: JourneyRunMode;
  stepConfig: JsonRecord;
};

export type JourneyDeliveryDispatcher = (
  input: JourneyDeliveryDispatchInput,
) => Promise<JourneyDeliveryDispatchResult>;

type JourneyDeliveryAdapterMap = Record<string, JourneyDeliveryDispatcher>;

function normalizeChannel(value: string): string {
  return value.trim().toLowerCase();
}

const defaultDeliveryAdapters: JourneyDeliveryAdapterMap = {
  logger: async (input) => {
    const sinkRecord: JourneyLoggerDeliveryRecord = {
      orgId: input.orgId,
      journeyRunId: input.journeyRunId,
      journeyDeliveryId: input.journeyDeliveryId,
      channel: "logger",
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
  },
};

export async function dispatchJourneyDelivery(
  input: JourneyDeliveryDispatchInput,
  adapters: JourneyDeliveryAdapterMap = defaultDeliveryAdapters,
): Promise<JourneyDeliveryDispatchResult> {
  const channel = normalizeChannel(input.channel);
  const adapter = adapters[channel];

  if (!adapter) {
    throw new Error(`Unsupported journey delivery channel "${channel}".`);
  }

  return adapter({
    ...input,
    channel,
  });
}
