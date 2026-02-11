import { mock } from "bun:test";
import { webhookInngest } from "../inngest/client.js";

const sendMock = mock(async () => ({ ids: ["test-event-id"] }));

(webhookInngest as unknown as { send: typeof webhookInngest.send }).send =
  sendMock;
