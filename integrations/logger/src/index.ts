import { getLogger } from "@logtape/logtape";
import { createIntegration } from "@integrations/core";

const logger = getLogger(["integrations", "logger"]);

export const loggerIntegration = createIntegration({
  name: "logger",
  supportedEventTypes: ["*"],
  async process(event) {
    logger.info("Logger integration received {eventType} ({eventId})", {
      eventId: event.id,
      eventType: event.type,
      orgId: event.orgId,
      payload: event.payload,
      occurredAt: event.timestamp,
    });
  },
});

export default loggerIntegration;
