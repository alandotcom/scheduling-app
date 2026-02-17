type JsonRecord = Record<string, unknown>;

export type JourneyDeliveryDispatchInput = {
  orgId: string;
  journeyRunId: string;
  journeyDeliveryId: string;
  channel: string;
  idempotencyKey: string;
  stepConfig: JsonRecord;
};

export type JourneyDeliveryDispatchResult = {
  providerMessageId?: string;
};

export type JourneyDeliveryDispatcher = (
  input: JourneyDeliveryDispatchInput,
) => Promise<JourneyDeliveryDispatchResult>;

type JourneyDeliveryAdapterMap = Record<string, JourneyDeliveryDispatcher>;

function normalizeChannel(value: string): string {
  return value.trim().toLowerCase();
}

const defaultDeliveryAdapters: JourneyDeliveryAdapterMap = {
  email: async (input) => ({
    providerMessageId: `email:${input.idempotencyKey}`,
  }),
  slack: async (input) => ({
    providerMessageId: `slack:${input.idempotencyKey}`,
  }),
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
