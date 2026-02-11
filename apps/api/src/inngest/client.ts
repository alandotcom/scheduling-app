import { EventSchemas, Inngest } from "inngest";
import type { WebhookEventDataByType, WebhookEventType } from "@scheduling/dto";
import { config } from "../config.js";

type SchedulingInngestEvents = {
  [K in WebhookEventType]: {
    data: {
      orgId: string;
    } & WebhookEventDataByType[K];
  };
} & {
  "scheduling/dev.ping": {
    data: {
      orgId: string;
    };
  };
};

export const inngest = new Inngest({
  id: "scheduling-api",
  schemas: new EventSchemas().fromRecord<SchedulingInngestEvents>(),
  ...(config.inngest.eventKey ? { eventKey: config.inngest.eventKey } : {}),
  ...(config.inngest.baseUrl ? { baseUrl: config.inngest.baseUrl } : {}),
});
