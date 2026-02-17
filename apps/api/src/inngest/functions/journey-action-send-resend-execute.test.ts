import { describe, expect, mock, test } from "bun:test";
import { InngestTestEngine } from "@inngest/test";
import type { JourneyDeliveryScheduledEventData } from "../runtime-events.js";
import type { JourneyDeliveryDispatchInput } from "../../services/journey-delivery-adapters.js";
import type { JourneyDeliveryWorkerDependencies } from "../../services/journey-delivery-worker.js";
import { createJourneyActionSendResendExecuteFunction } from "./journey-action-send-resend-execute.js";

describe("journey action send resend execute function", () => {
  test("configures cancelOn for delivery cancellation events", () => {
    const fn = createJourneyActionSendResendExecuteFunction(async () => ({
      journeyDeliveryId: "delivery_1",
      journeyRunId: "run_1",
      status: "canceled",
      attempts: 0,
      reasonCode: "manual_cancel",
    }));

    expect(fn["opts"]).toMatchObject({
      id: "journey-action-send-resend-execute",
      concurrency: {
        key: "event.data.orgId",
        limit: 10,
      },
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

    const fn = createJourneyActionSendResendExecuteFunction(executeDelivery);
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          name: "journey.action.send-resend.execute",
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
        dispatchDelivery: expect.any(Function),
        runtime: expect.objectContaining({
          runStep: expect.any(Function),
          sleep: expect.any(Function),
        }),
      }),
    );
  });

  test("uses the injected resend dispatcher dependency", async () => {
    const dispatchDelivery = mock(
      async (_input: JourneyDeliveryDispatchInput) => ({
        providerMessageId: "resend-provider-message-1",
      }),
    );
    const executeDelivery = mock(
      async (
        _eventData: JourneyDeliveryScheduledEventData,
        dependencies: JourneyDeliveryWorkerDependencies = {},
      ) => {
        const dispatch = dependencies.dispatchDelivery;
        if (!dispatch) {
          throw new Error("dispatchDelivery was not provided");
        }

        await dispatch({
          orgId: "org_1",
          journeyRunId: "run_1",
          journeyDeliveryId: "delivery_1",
          channel: "email",
          idempotencyKey: "run_1:send-node:2026-02-16T10:00:00.000Z",
          stepConfig: {
            actionType: "send-resend",
          },
        });

        return {
          journeyDeliveryId: "delivery_1",
          journeyRunId: "run_1",
          status: "sent" as const,
          attempts: 1,
          providerMessageId: "provider-message-1",
        };
      },
    );

    const fn = createJourneyActionSendResendExecuteFunction(
      executeDelivery,
      dispatchDelivery,
    );
    const t = new InngestTestEngine({ function: fn });

    await t.execute({
      events: [
        {
          name: "journey.action.send-resend.execute",
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

    expect(executeDelivery).toHaveBeenCalledTimes(1);
    expect(executeDelivery.mock.calls[0]?.[1]?.dispatchDelivery).toBe(
      dispatchDelivery,
    );
    expect(dispatchDelivery).toHaveBeenCalledTimes(1);
    expect(dispatchDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        stepConfig: expect.objectContaining({
          actionType: "send-resend",
        }),
      }),
    );
  });
});
