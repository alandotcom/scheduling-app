import { EventSchemas, Inngest } from "inngest";
import type { DomainEventDataByType, DomainEventType } from "@scheduling/dto";
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

type ProviderExecuteEventName =
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

export const domainEventInngest = new Inngest({
  ...inngestClientOptions,
  schemas: new EventSchemas().fromRecord<SchedulingDomainEvents>(),
});
