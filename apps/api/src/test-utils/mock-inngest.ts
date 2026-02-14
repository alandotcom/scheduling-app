import { mock } from "bun:test";
import { domainEventInngest } from "../inngest/client.js";

const sendMock = mock(async () => ({ ids: ["test-event-id"] }));

(
  domainEventInngest as unknown as {
    send: typeof domainEventInngest.send;
  }
).send = sendMock;

export { sendMock };
