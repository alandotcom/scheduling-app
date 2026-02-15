import { describe, expect, test } from "bun:test";
import {
  serializedWorkflowGraphSchema,
  workflowDomainEventTriggerConfigSchema,
} from "./workflow-graph";
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  workflowExecuteInputSchema,
  workflowExecutionSampleListResponseSchema,
  workflowSchema,
  workflowExecuteResponseSchema,
  workflowTriggerExecutionResponseSchema,
} from "./workflow";

const TEST_EXECUTION_ID = "550e8400-e29b-41d4-a716-446655440001";

describe("Workflow domain-event trigger config schema", () => {
  test("accepts canonical domain event routing sets", () => {
    const result = workflowDomainEventTriggerConfigSchema.safeParse({
      triggerType: "DomainEvent",
      domain: "appointment",
      startEvents: ["appointment.created"],
      restartEvents: ["appointment.updated"],
      stopEvents: ["appointment.deleted"],
    });

    expect(result.success).toBe(true);
  });

  test("rejects events outside the selected domain", () => {
    const result = workflowDomainEventTriggerConfigSchema.safeParse({
      triggerType: "DomainEvent",
      domain: "appointment",
      startEvents: ["appointment.created", "client.created"],
      restartEvents: [],
      stopEvents: [],
    });

    expect(result.success).toBe(false);
  });

  test("normalizes comma-separated routing sets", () => {
    const parsed = workflowDomainEventTriggerConfigSchema.parse({
      triggerType: "DomainEvent",
      domain: "appointment",
      startEvents: "appointment.created, appointment.created",
      restartEvents: "",
      stopEvents: "appointment.updated",
    });

    expect(parsed.startEvents).toEqual(["appointment.created"]);
    expect(parsed.restartEvents).toEqual([]);
    expect(parsed.stopEvents).toEqual(["appointment.updated"]);
  });

  test("rejects non-canonical event types", () => {
    const result = workflowDomainEventTriggerConfigSchema.safeParse({
      triggerType: "DomainEvent",
      domain: "appointment",
      startEvents: ["appointment.archived"],
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
                domain: "appointment",
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

  test("rejects resumed response in trigger execution union", () => {
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

    expect(triggerResponse.success).toBe(false);
    expect(executeResponse.success).toBe(false);
  });
});

describe("Workflow runtime toggle schema contracts", () => {
  test("includes isEnabled in workflow payloads", () => {
    const result = workflowSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      orgId: "550e8400-e29b-41d4-a716-446655440001",
      name: "Client Workflow",
      description: null,
      graph: {
        nodes: [],
        edges: [],
      },
      isEnabled: false,
      visibility: "private",
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  test("accepts optional isEnabled in create and update payloads", () => {
    const createResult = createWorkflowSchema.safeParse({
      name: "Runtime Toggle Workflow",
      graph: { nodes: [], edges: [] },
      isEnabled: true,
    });

    const updateResult = updateWorkflowSchema.safeParse({
      isEnabled: false,
    });

    expect(createResult.success).toBe(true);
    expect(updateResult.success).toBe(true);
  });
});

describe("Workflow execute input and sample event schemas", () => {
  test("requires eventType and payload for execute input", () => {
    const valid = workflowExecuteInputSchema.safeParse({
      eventType: "appointment.created",
      payload: { appointmentId: "550e8400-e29b-41d4-a716-446655440010" },
      dryRun: true,
    });

    const invalid = workflowExecuteInputSchema.safeParse({
      dryRun: true,
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  test("accepts workflow execution sample list response payload", () => {
    const result = workflowExecutionSampleListResponseSchema.safeParse({
      samples: [
        {
          eventType: "client.updated",
          recordId: "550e8400-e29b-41d4-a716-446655440020",
          label: "Ada Lovelace",
          payload: {
            clientId: "550e8400-e29b-41d4-a716-446655440020",
            firstName: "Ada",
            lastName: "Lovelace",
            email: null,
            phone: null,
            previous: {
              clientId: "550e8400-e29b-41d4-a716-446655440020",
              firstName: "Ada",
              lastName: "Lovelace",
              email: null,
              phone: null,
            },
          },
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});
