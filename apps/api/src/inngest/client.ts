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
        versionId: string | null;
        workflowType: string;
        compiledPlan?: Record<string, unknown> | null;
      };
      sourceEvent: {
        id: string;
        type: DomainEventType | "schedule.triggered" | "manual.triggered";
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
