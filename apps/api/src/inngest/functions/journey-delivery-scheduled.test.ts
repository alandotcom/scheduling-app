import { describe, expect, mock, test } from "bun:test";
import { InngestTestEngine } from "@inngest/test";
import { createJourneyDeliveryScheduledFunction } from "./journey-delivery-scheduled.js";

describe("journey delivery scheduled function", () => {
  test("configures cancelOn for delivery cancellation events", () => {
    const fn = createJourneyDeliveryScheduledFunction(async () => ({
      journeyDeliveryId: "delivery_1",
      journeyRunId: "run_1",
      status: "canceled",
      attempts: 0,
      reasonCode: "manual_cancel",
    }));

    expect(fn["opts"]).toMatchObject({
      id: "journey-delivery-scheduled",
      cancelOn: [
        {
          event: "journey.delivery.canceled",
          if: "async.data.journeyDeliveryId == event.data.journeyDeliveryId",
        },
      ],
    });
  });

  test("forwards event payload to delivery worker", async () => {
    const executeDelivery = mock(async () => ({
      journeyDeliveryId: "delivery_1",
      journeyRunId: "run_1",
      status: "sent" as const,
      attempts: 1,
      providerMessageId: "provider-message-1",
    }));

    const fn = createJourneyDeliveryScheduledFunction(executeDelivery);
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          name: "journey.delivery.scheduled",
          data: {
            orgId: "org_1",
            journeyDeliveryId: "delivery_1",
            journeyRunId: "run_1",
            deterministicKey: "run_1:send-node:2026-02-16T10:00:00.000Z",
            scheduledFor: "2026-02-16T10:00:00.000Z",
          },
        },
      ],
    });

    expect(result).toMatchObject({
      journeyDeliveryId: "delivery_1",
      status: "sent",
    });

    expect(executeDelivery).toHaveBeenCalledTimes(1);
    expect(executeDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyDeliveryId: "delivery_1",
        journeyRunId: "run_1",
      }),
      expect.objectContaining({
        runtime: expect.objectContaining({
          runStep: expect.any(Function),
          sleep: expect.any(Function),
        }),
      }),
    );
  });
});
