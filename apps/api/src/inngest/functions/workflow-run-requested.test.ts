import { describe, expect, mock, test } from "bun:test";
import { InngestTestEngine } from "@inngest/test";
import { createWorkflowRunRequestedFunction } from "./workflow-run-requested.js";

function createGraph() {
  return {
    attributes: {},
    options: { type: "directed" as const },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger" as const,
            label: "Webhook",
            config: {
              triggerType: "DomainEvent",
              domain: "client",
              startEvents: ["client.created"],
              restartEvents: [],
              stopEvents: [],
            },
          },
        },
      },
    ],
    edges: [],
  };
}

describe("workflow run requested function", () => {
  test("configures cancelOn for execution cancellation events", () => {
    const fn = createWorkflowRunRequestedFunction(async () => {});

    expect(fn["opts"]).toMatchObject({
      id: "workflow-run-requested",
      retries: 0,
      cancelOn: [
        {
          event: "workflow/run.cancel.requested",
          if: "async.data.executionId == event.data.executionId",
        },
      ],
    });
  });

  test("forwards runtime event payload to workflow runner", async () => {
    const executeRun = mock(async () => {});
    const fn = createWorkflowRunRequestedFunction(executeRun);
    const t = new InngestTestEngine({ function: fn });

    const { result } = await t.execute({
      events: [
        {
          name: "workflow/run.requested",
          data: {
            orgId: "org_1",
            workflowId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
            workflowName: "Client workflow",
            executionId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
            graph: createGraph(),
            triggerInput: {
              clientId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d13",
            },
            eventContext: {
              eventType: "client.created",
            },
          },
        },
      ],
    });

    expect(result).toMatchObject({
      executionId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
      workflowId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
      status: "processed",
    });

    expect(executeRun).toHaveBeenCalledTimes(1);
    expect(executeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d12",
        workflowId: "018f4d3a-6d80-7c5b-8a4a-6cb8f8d57d11",
      }),
      expect.objectContaining({
        sleep: expect.any(Function),
      }),
    );
  });
});
