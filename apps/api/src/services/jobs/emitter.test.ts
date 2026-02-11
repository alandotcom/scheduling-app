import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { WebhookEventDataByType } from "@scheduling/dto";
import { webhookInngest } from "../../inngest/client.js";
import { emitEvent } from "./emitter.js";

describe("emitEvent", () => {
  const orgId = "00000000-0000-0000-0000-000000000000";
  const payload: WebhookEventDataByType["client.created"] = {
    clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d01",
    firstName: "Ada",
    lastName: "Lovelace",
    email: null,
  };

  const originalSend = webhookInngest.send.bind(webhookInngest);

  beforeEach(() => {
    (webhookInngest as unknown as { send: typeof webhookInngest.send }).send =
      originalSend;
  });

  afterEach(() => {
    (webhookInngest as unknown as { send: typeof webhookInngest.send }).send =
      originalSend;
  });

  test("sends an event to Inngest with deterministic shape", async () => {
    const sendMock = mock(async () => ({ ids: ["test-event-id"] }));
    (webhookInngest as unknown as { send: typeof webhookInngest.send }).send =
      sendMock;

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
    (webhookInngest as unknown as { send: typeof webhookInngest.send }).send =
      sendMock;

    await expect(emitEvent(orgId, "client.created", payload)).resolves.toEqual(
      expect.any(String),
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
