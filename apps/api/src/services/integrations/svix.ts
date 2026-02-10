import { createIntegration } from "@integrations/core";
import { publishWebhookEvent } from "../svix.js";

export const svixIntegration = createIntegration({
  name: "svix",
  supportedEventTypes: ["*"],
  async process(event) {
    await publishWebhookEvent({
      eventId: event.id,
      eventType: event.type,
      orgId: event.orgId,
      payload: event.payload,
      occurredAt: event.timestamp,
    });
  },
});
