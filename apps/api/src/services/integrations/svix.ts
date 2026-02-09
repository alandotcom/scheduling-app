import type { IntegrationConsumer } from "@integrations/core";
import { publishWebhookEvent } from "../svix.js";

export const svixIntegration: IntegrationConsumer = {
  name: "svix",
  queueName: "scheduling-events.integration.svix",
  supportedEventTypes: ["*"],
  concurrency: 10,
  jobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delayMs: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
  async process(event) {
    await publishWebhookEvent({
      eventId: event.id,
      eventType: event.type,
      orgId: event.orgId,
      payload: event.payload,
      occurredAt: event.timestamp,
    });
  },
};
