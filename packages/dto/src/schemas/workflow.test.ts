import { describe, expect, test } from "bun:test";
import {
  serializedWorkflowGraphSchema,
  workflowDomainEventTriggerConfigSchema,
} from "./workflow-graph";
import {
  workflowExecuteResponseSchema,
  workflowTriggerExecutionResponseSchema,
} from "./workflow";

const TEST_EXECUTION_ID = "550e8400-e29b-41d4-a716-446655440001";

describe("Workflow domain-event trigger config schema", () => {
  test("accepts canonical domain event routing sets", () => {
    const result = workflowDomainEventTriggerConfigSchema.safeParse({
      triggerType: "DomainEvent",
      startEvents: ["appointment.created", "client.created"],
      restartEvents: ["appointment.updated"],
      stopEvents: ["appointment.updated", "client.deleted"],
    });

    expect(result.success).toBe(true);
  });

  test("normalizes comma-separated routing sets", () => {
    const parsed = workflowDomainEventTriggerConfigSchema.parse({
      triggerType: "DomainEvent",
      startEvents: "appointment.created, appointment.created, client.created",
      restartEvents: "",
      stopEvents: "appointment.updated",
    });

    expect(parsed.startEvents).toEqual([
      "appointment.created",
      "client.created",
    ]);
    expect(parsed.restartEvents).toEqual([]);
    expect(parsed.stopEvents).toEqual(["appointment.updated"]);
  });

  test("rejects non-canonical event types", () => {
    const result = workflowDomainEventTriggerConfigSchema.safeParse({
      triggerType: "DomainEvent",
      startEvents: ["appointment.deleted"],
      restartEvents: [],
      stopEvents: [],
    });

    expect(result.success).toBe(false);
  });
});

describe("Serialized workflow graph schema", () => {
  test("accepts a valid graph payload", () => {
    const result = serializedWorkflowGraphSchema.safeParse({
      nodes: [
        {
          key: "node-trigger",
          attributes: {
            id: "node-trigger",
            position: { x: 0, y: 0 },
            data: {
              label: "Trigger",
              type: "trigger",
              config: {
                triggerType: "DomainEvent",
                startEvents: ["appointment.created"],
                restartEvents: ["appointment.updated"],
                stopEvents: ["appointment.updated"],
              },
            },
          },
        },
        {
          key: "node-action",
          attributes: {
            id: "node-action",
            position: { x: 240, y: 0 },
            data: {
              label: "Action",
              type: "action",
              config: {
                integrationId: "550e8400-e29b-41d4-a716-446655440002",
              },
            },
          },
        },
      ],
      edges: [
        {
          key: "edge-trigger-action",
          source: "node-trigger",
          target: "node-action",
          attributes: {
            id: "edge-trigger-action",
            source: "node-trigger",
            target: "node-action",
          },
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  test("rejects invalid node data", () => {
    const result = serializedWorkflowGraphSchema.safeParse({
      nodes: [
        {
          key: "node-invalid",
          attributes: {
            id: "node-invalid",
            data: {
              label: "Invalid",
              type: "unsupported",
            },
          },
        },
      ],
      edges: [],
    });

    expect(result.success).toBe(false);
  });
});

describe("Workflow execution response contracts", () => {
  test("accepts running response in execute union", () => {
    const result = workflowExecuteResponseSchema.safeParse({
      status: "running",
      executionId: TEST_EXECUTION_ID,
      runId: "inngest-run-id",
      dryRun: false,
    });

    expect(result.success).toBe(true);
  });

  test("requires executionId for cancelled execute responses", () => {
    const result = workflowExecuteResponseSchema.safeParse({
      status: "cancelled",
      dryRun: false,
      cancelledExecutions: 1,
      cancelledWaits: 1,
    });

    expect(result.success).toBe(false);
  });

  test("accepts resumed response only in trigger execution union", () => {
    const triggerResponse = workflowTriggerExecutionResponseSchema.safeParse({
      status: "resumed",
      resumedCount: 2,
      dryRun: false,
    });

    const executeResponse = workflowExecuteResponseSchema.safeParse({
      status: "resumed",
      resumedCount: 2,
      dryRun: false,
    });

    expect(triggerResponse.success).toBe(true);
    expect(executeResponse.success).toBe(false);
  });
});
