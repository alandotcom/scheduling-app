import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { WebhookEventDataByType } from "@scheduling/dto";
import { inngest } from "../../inngest/client.js";
import { emitEvent } from "./emitter.js";

describe("emitEvent", () => {
  const orgId = "00000000-0000-0000-0000-000000000000";
  const payload: WebhookEventDataByType["client.created"] = {
    clientId: "00000000-0000-0000-0000-000000000001",
    firstName: "Ada",
    lastName: "Lovelace",
    email: null,
  };

  const originalSend = inngest.send;

  beforeEach(() => {
    (inngest as unknown as { send: typeof inngest.send }).send = originalSend;
  });

  afterEach(() => {
    (inngest as unknown as { send: typeof inngest.send }).send = originalSend;
  });

  test("sends an event to Inngest with deterministic shape", async () => {
    const sendMock = mock(async () => ({ ids: ["test-event-id"] }));
    (inngest as unknown as { send: typeof inngest.send }).send = sendMock;

    const eventId = await emitEvent(orgId, "client.created", payload);

    expect(eventId).toEqual(expect.any(String));
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: eventId,
        name: "client.created",
        data: {
          orgId,
          ...payload,
        },
        ts: expect.any(Number),
      }),
    );
  });

  test("returns event id even when Inngest send fails", async () => {
    const sendMock = mock(async () => {
      throw new Error("failed-send");
    });
    (inngest as unknown as { send: typeof inngest.send }).send = sendMock;

    await expect(
      emitEvent(orgId, "client.created", payload),
    ).resolves.toEqual(expect.any(String));
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
