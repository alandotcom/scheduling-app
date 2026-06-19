import { devPingEvent, inngest } from "../client.js";

export const devPingFunction = inngest.createFunction(
  { id: "dev-ping", triggers: [devPingEvent] },
  async ({ event, step }) => {
    return step.run("acknowledge-ping", async () => ({
      ok: true,
      receivedEventId: event.id,
      receivedAt: new Date().toISOString(),
    }));
  },
);
