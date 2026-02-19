import { mock } from "bun:test";
import { inngest } from "../inngest/client.js";

const inngestSendMock = mock(async (_payload: unknown) => {
  /* no-op: silently accept event sends in tests */
});

// Override the readonly send method with our mock for test isolation.
(inngest as unknown as Record<string, unknown>)["send"] = inngestSendMock;

export { inngestSendMock };
