import { EventSchemas, Inngest } from "inngest";
import type {
  DomainEventData,
  DomainEventDataByType,
  DomainEventType,
} from "@scheduling/dto";
import { config } from "../config.js";

type SchedulingDomainEvents = {
  [K in DomainEventType]: {
    data: {
      orgId: string;
    } & DomainEventDataByType[K];
  };
};

type DeliveryScheduledData = {
  orgId: string;
  journeyDeliveryId: string;
  journeyRunId: string;
  deterministicKey: string;
  scheduledFor: string;
};

export type ProviderExecuteEventName =
  | "journey.action.send-resend.execute"
  | "journey.action.send-slack.execute"
  | "journey.action.send-twilio.execute";

type SchedulingInternalEvents = {
  "scheduling/dev.ping": {
    data: {
      orgId: string;
    };
  };
  "journey.delivery.scheduled": {
    data: DeliveryScheduledData;
  };
  "journey.action.send-twilio.callback-received": {
    data: {
      orgId: string;
      journeyDeliveryId: string;
      messageSid: string;
      messageStatus: string;
      errorCode?: string | null;
    };
  };
  "journey.delivery.canceled": {
    data: {
      orgId: string;
      journeyDeliveryId: string;
      journeyRunId: string;
      deterministicKey: string;
      reasonCode: string;
    };
  };
} & {
  [K in ProviderExecuteEventName]: { data: DeliveryScheduledData };
};

type SchedulingInngestEvents = SchedulingDomainEvents &
  SchedulingInternalEvents;

const inngestClientOptions = {
  id: "scheduling-api",
  ...(config.inngest.eventKey ? { eventKey: config.inngest.eventKey } : {}),
  ...(config.inngest.baseUrl ? { baseUrl: config.inngest.baseUrl } : {}),
} as const;

export const inngest = new Inngest({
  ...inngestClientOptions,
  schemas: new EventSchemas().fromRecord<SchedulingInngestEvents>(),
});

/**
 * Typed wrapper for sending domain events through the main Inngest client.
 * Constrains callers to domain event types while using a single Inngest instance.
 *
 * The cast bridges the generic DomainEventType union to Inngest's discriminated
 * union parameter; both map DomainEventType keys identically so the cast is safe.
 */
export function sendDomainEvent<K extends DomainEventType>(event: {
  id: string;
  name: K;
  data: { orgId: string } & DomainEventData<K>;
  ts: number;
}) {
  return inngest.send(event as unknown as Parameters<typeof inngest.send>[0]);
}
