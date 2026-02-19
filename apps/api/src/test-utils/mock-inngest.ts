import { mock } from "bun:test";
import { inngest } from "../inngest/client.js";

const inngestSendMock = mock(async (_payload: unknown) => {
  /* no-op: silently accept event sends in tests */
});

(
  inngest as unknown as {
    send: typeof inngest.send;
  }
).send = inngestSendMock as typeof inngest.send;

export { inngestSendMock };
