import { describe, expect, test } from "bun:test";
import { InngestTestEngine } from "@inngest/test";
import { devPingFunction } from "./dev-ping.js";

describe("devPingFunction", () => {
  const t = new InngestTestEngine({
    function: devPingFunction,
  });

  test("executes to completion and returns acknowledgment payload", async () => {
    const { result } = await t.execute({
      events: [
        {
          name: "scheduling/dev.ping",
          data: { orgId: "org-test-1" },
        },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      receivedEventId: expect.any(String),
      receivedAt: expect.any(String),
    });
  });

  test("can execute just the acknowledgement step", async () => {
    const { result } = await t.executeStep("acknowledge-ping", {
      events: [
        {
          name: "scheduling/dev.ping",
          data: { orgId: "org-test-2" },
        },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      receivedAt: expect.any(String),
    });
  });
});
