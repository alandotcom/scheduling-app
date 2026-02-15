import { describe, expect, mock, test } from "bun:test";
import { InngestTestEngine } from "@inngest/test";
import { createWorkflowDomainTriggerFunction } from "./workflow-domain-triggers.js";

describe("workflow domain trigger function", () => {
  test("extracts canonical event data and forwards to processor", async () => {
    const processEvent = mock(async () => ({
      eventId: "event-client-created-1",
      eventType: "client.created" as const,
      orgId: "org_1",
      startedExecutionIds: ["exec_1"],
      ignoredWorkflowIds: [],
      erroredWorkflowIds: [],
    }));

    const fn = createWorkflowDomainTriggerFunction(
      "client.created",
      processEvent,
    );
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          id: "event-client-created-1",
          ts: 1_700_000_000_000,
          name: "client.created",
          data: {
            orgId: "org_1",
            clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d31",
            firstName: "Ada",
            lastName: "Lovelace",
            email: null,
            phone: null,
          },
        },
      ],
    });

    expect(result).toMatchObject({
      eventId: "event-client-created-1",
      startedExecutionIds: ["exec_1"],
    });

    expect(processEvent).toHaveBeenCalledTimes(1);
    expect(processEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "event-client-created-1",
        orgId: "org_1",
        type: "client.created",
        payload: {
          clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d31",
          firstName: "Ada",
          lastName: "Lovelace",
          email: null,
          phone: null,
        },
        timestamp: new Date(1_700_000_000_000).toISOString(),
      }),
    );
  });

  test("throws for invalid payload shape", async () => {
    const processEvent = mock(async () => ({
      eventId: "ignored",
      eventType: "client.created" as const,
      orgId: "org_1",
      startedExecutionIds: [],
      ignoredWorkflowIds: [],
      erroredWorkflowIds: [],
    }));

    const fn = createWorkflowDomainTriggerFunction(
      "client.created",
      processEvent,
    );
    const t = new InngestTestEngine({ function: fn });
    const originalConsoleError = console.error;
    console.error = () => {};

    const execution = await t
      .execute({
        events: [
          {
            name: "client.created",
            data: {
              orgId: "org_1",
              clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d32",
              firstName: "Ada",
            },
          },
        ],
      })
      .finally(() => {
        console.error = originalConsoleError;
      });

    expect(execution.error).toBeDefined();
    expect(execution.error).toEqual(
      expect.objectContaining({
        message: 'Invalid payload for event type "client.created".',
      }),
    );

    expect(processEvent).toHaveBeenCalledTimes(0);
  });
});
