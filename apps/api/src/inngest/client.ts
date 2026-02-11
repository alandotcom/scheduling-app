import { EventSchemas, Inngest } from "inngest";
import type { WebhookEventDataByType, WebhookEventType } from "@scheduling/dto";
import { config } from "../config.js";

type SchedulingWebhookEvents = {
  [K in WebhookEventType]: {
    data: {
      orgId: string;
    } & WebhookEventDataByType[K];
  };
};

type SchedulingInternalEvents = {
  "scheduling/dev.ping": {
    data: {
      orgId: string;
    };
  };
  "scheduling/workflow.triggered": {
    data: {
      orgId: string;
      workflow: {
        definitionId: string;
        versionId: string;
        workflowType: string;
      };
      sourceEvent: {
        id: string;
        type: WebhookEventType;
        timestamp: string;
        payload: Record<string, unknown>;
      };
      entity: {
        type: string;
        id: string;
      };
    };
  };
};

type SchedulingInngestEvents = SchedulingWebhookEvents &
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

export const webhookInngest = new Inngest({
  ...inngestClientOptions,
  schemas: new EventSchemas().fromRecord<SchedulingWebhookEvents>(),
});
