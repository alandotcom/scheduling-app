import { getLogger } from "@logtape/logtape";
import type { IntegrationConsumer } from "@integrations/core";

const logger = getLogger(["integrations", "logger"]);

export const loggerIntegration: IntegrationConsumer = {
  name: "logger",
  queueName: "scheduling-events.integration.logger",
  supportedEventTypes: ["*"],
  concurrency: 5,
  jobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
  async process(event) {
    logger.info("Logger integration received {eventType} ({eventId})", {
      eventId: event.id,
      eventType: event.type,
      orgId: event.orgId,
      payload: event.payload,
      occurredAt: event.timestamp,
    });
  },
};

export default loggerIntegration;
