import { describe, expect, mock, test } from "bun:test";
import { createIntegration } from "@integrations/core";
import { InngestTestEngine } from "@inngest/test";
import {
  createIntegrationFanoutFunction,
  INTEGRATION_FANOUT_FLOW_CONTROL,
} from "./integration-fanout.js";

describe("integration fanout function", () => {
  test("dispatches to enabled integrations that support the event", async () => {
    const loggerProcess = mock(async () => {});
    const clientSyncProcess = mock(async () => {});
    const appointmentOnlyProcess = mock(async () => {});

    const loggerIntegration = createIntegration({
      name: "logger",
      supportedEventTypes: ["*"],
      process: loggerProcess,
    });
    const clientSyncIntegration = createIntegration({
      name: "client-sync",
      supportedEventTypes: ["client.created"],
      process: clientSyncProcess,
    });
    const appointmentOnlyIntegration = createIntegration({
      name: "appointment-only",
      supportedEventTypes: ["appointment.scheduled"],
      process: appointmentOnlyProcess,
    });

    const fn = createIntegrationFanoutFunction("client.created", async () => [
      loggerIntegration,
      clientSyncIntegration,
      appointmentOnlyIntegration,
    ]);
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          id: "event-client-created-1",
          ts: 1_700_000_000_000,
          name: "client.created",
          data: {
            orgId: "org_1",
            clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d01",
            firstName: "Ada",
            lastName: "Lovelace",
            email: null,
            phone: null,
            customAttributes: {},
          },
        },
      ],
    });

    expect(result).toMatchObject({
      eventType: "client.created",
      orgId: "org_1",
      dispatchedIntegrationNames: ["logger", "client-sync"],
    });

    expect(loggerProcess).toHaveBeenCalledTimes(1);
    expect(clientSyncProcess).toHaveBeenCalledTimes(1);
    expect(appointmentOnlyProcess).toHaveBeenCalledTimes(0);

    expect(loggerProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "event-client-created-1",
        type: "client.created",
        orgId: "org_1",
        payload: {
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d01",
          firstName: "Ada",
          lastName: "Lovelace",
          email: null,
          phone: null,
          customAttributes: {},
        },
        timestamp: new Date(1_700_000_000_000).toISOString(),
      }),
    );
  });

  test("returns empty dispatch list when no integration supports the event", async () => {
    const appointmentOnlyProcess = mock(async () => {});
    const appointmentOnlyIntegration = createIntegration({
      name: "appointment-only",
      supportedEventTypes: ["appointment.scheduled"],
      process: appointmentOnlyProcess,
    });

    const fn = createIntegrationFanoutFunction("client.created", async () => [
      appointmentOnlyIntegration,
    ]);
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          name: "client.created",
          data: {
            orgId: "org_2",
            clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d02",
            firstName: "Grace",
            lastName: "Hopper",
            email: null,
            phone: null,
            customAttributes: {},
          },
        },
      ],
    });

    expect(result).toMatchObject({
      eventType: "client.created",
      orgId: "org_2",
      dispatchedIntegrationNames: [],
    });
    expect(appointmentOnlyProcess).not.toHaveBeenCalled();
  });

  test("applies per-org flow control settings", () => {
    const fn = createIntegrationFanoutFunction(
      "client.created",
      async () => [],
    );

    expect(fn.opts).toMatchObject({
      concurrency: {
        key: "event.data.orgId",
        limit: INTEGRATION_FANOUT_FLOW_CONTROL.concurrencyLimit,
      },
      throttle: {
        key: "event.data.orgId",
        limit: INTEGRATION_FANOUT_FLOW_CONTROL.throttleLimitPerMinute,
        period: "1m",
        burst: INTEGRATION_FANOUT_FLOW_CONTROL.throttleBurstPerMinute,
      },
    });
  });
});
