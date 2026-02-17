import { EventSchemas, Inngest } from "inngest";
import type {
  DomainEventDataByType,
  DomainEventType,
  SerializedWorkflowGraph,
} from "@scheduling/dto";
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
  "workflow/run.requested": {
    data: {
      orgId: string;
      workflowId: string;
      workflowName: string;
      executionId: string;
      graph: SerializedWorkflowGraph;
      triggerInput: Record<string, unknown>;
      eventContext: {
        eventType: DomainEventType;
        correlationKey?: string;
      };
    };
  };
  "workflow/run.cancel.requested": {
    data: {
      executionId: string;
      workflowId: string;
      reason: string;
      requestedBy: string;
      eventType?: DomainEventType;
      correlationKey?: string;
    };
  };
  "journey.delivery.scheduled": {
    data: {
      orgId: string;
      journeyDeliveryId: string;
      journeyRunId: string;
      deterministicKey: string;
      scheduledFor: string;
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
