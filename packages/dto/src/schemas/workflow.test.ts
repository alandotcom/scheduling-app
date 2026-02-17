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

function createLinearJourneyGraph() {
  return {
    nodes: [
      {
        key: "trigger-step",
        attributes: {
          id: "trigger-step",
          position: { x: 0, y: 0 },
          data: {
            label: "Trigger",
            type: "trigger",
            config: {
              triggerType: "DomainEvent",
              domain: "appointment",
              startEvents: ["appointment.scheduled"],
              restartEvents: [],
              stopEvents: ["appointment.canceled"],
            },
          },
        },
      },
      {
        key: "wait-step",
        attributes: {
          id: "wait-step",
          position: { x: 240, y: 0 },
          data: {
            label: "Wait",
            type: "action",
            config: {
              actionType: "wait",
            },
          },
        },
      },
      {
        key: "send-message-step",
        attributes: {
          id: "send-message-step",
          position: { x: 480, y: 0 },
          data: {
            label: "Send Message",
            type: "action",
            config: {
              actionType: "send-message",
            },
          },
        },
      },
      {
        key: "logger-step",
        attributes: {
          id: "logger-step",
          position: { x: 720, y: 0 },
          data: {
            label: "Logger",
            type: "action",
            config: {
              actionType: "logger",
              message: "Delivered",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: "edge-trigger-wait",
        source: "trigger-step",
        target: "wait-step",
        attributes: {
          id: "edge-trigger-wait",
          source: "trigger-step",
          target: "wait-step",
        },
      },
      {
        key: "edge-wait-send",
        source: "wait-step",
        target: "send-message-step",
        attributes: {
          id: "edge-wait-send",
          source: "wait-step",
          target: "send-message-step",
        },
      },
      {
        key: "edge-send-logger",
        source: "send-message-step",
        target: "logger-step",
        attributes: {
          id: "edge-send-logger",
          source: "send-message-step",
          target: "logger-step",
        },
      },
    ],
  };
}

describe("Workflow domain-event trigger config schema", () => {
  test("accepts canonical domain event routing sets", () => {
    const result = workflowDomainEventTriggerConfigSchema.safeParse({
      triggerType: "DomainEvent",
      domain: "appointment",
      startEvents: ["appointment.scheduled"],
      restartEvents: ["appointment.rescheduled"],
      stopEvents: ["appointment.canceled"],
    });

    expect(result.success).toBe(true);
  });

  test("rejects events outside the selected domain", () => {
    const result = workflowDomainEventTriggerConfigSchema.safeParse({
      triggerType: "DomainEvent",
      domain: "appointment",
      startEvents: ["appointment.scheduled", "client.created"],
      restartEvents: [],
      stopEvents: [],
    });

    expect(result.success).toBe(false);
  });

  test("normalizes comma-separated routing sets", () => {
    const parsed = workflowDomainEventTriggerConfigSchema.parse({
      triggerType: "DomainEvent",
      domain: "appointment",
      startEvents: "appointment.scheduled, appointment.scheduled",
      restartEvents: "",
      stopEvents: "appointment.rescheduled",
    });

    expect(parsed.startEvents).toEqual(["appointment.scheduled"]);
    expect(parsed.restartEvents).toEqual([]);
    expect(parsed.stopEvents).toEqual(["appointment.rescheduled"]);
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

  test("accepts structured trigger filters with one-level groups", () => {
    const result = workflowDomainEventTriggerConfigSchema.safeParse({
      triggerType: "DomainEvent",
      domain: "appointment",
      startEvents: ["appointment.scheduled"],
      restartEvents: ["appointment.rescheduled"],
      stopEvents: ["appointment.canceled"],
      filter: {
        logic: "and",
        groups: [
          {
            logic: "and",
            conditions: [
              {
                field: "appointment.status",
                operator: "equals",
                value: "scheduled",
              },
              {
                field: "client.email",
                operator: "is_set",
              },
            ],
          },
        ],
      },
    });

    expect(result.success).toBe(true);
  });

  test("rejects trigger filters that exceed group cap", () => {
    const result = workflowDomainEventTriggerConfigSchema.safeParse({
      triggerType: "DomainEvent",
      domain: "appointment",
      startEvents: ["appointment.scheduled"],
      restartEvents: [],
      stopEvents: [],
      filter: {
        logic: "or",
        groups: [
          {
            logic: "and",
            conditions: [
              {
                field: "appointment.status",
                operator: "equals",
                value: "scheduled",
              },
            ],
          },
          {
            logic: "and",
            conditions: [
              {
                field: "appointment.status",
                operator: "equals",
                value: "confirmed",
              },
            ],
          },
          {
            logic: "and",
            conditions: [
              {
                field: "appointment.status",
                operator: "equals",
                value: "pending",
              },
            ],
          },
          {
            logic: "and",
            conditions: [
              {
                field: "appointment.status",
                operator: "equals",
                value: "noshow",
              },
            ],
          },
          {
            logic: "and",
            conditions: [
              {
                field: "appointment.status",
                operator: "equals",
                value: "canceled",
              },
            ],
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) => issue.path.join(".") === "filter.groups",
        ),
      ).toBe(true);
    }
  });

  test("rejects trigger filters that exceed total condition cap", () => {
    const conditions = Array.from({ length: 13 }, (_, index) => ({
      field: "appointment.status",
      operator: "equals",
      value: `status-${index}`,
    }));

    const result = workflowDomainEventTriggerConfigSchema.safeParse({
      triggerType: "DomainEvent",
      domain: "appointment",
      startEvents: ["appointment.scheduled"],
      restartEvents: [],
      stopEvents: [],
      filter: {
        logic: "and",
        groups: [
          {
            logic: "and",
            conditions,
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (issue) =>
            issue.path.join(".") === "filter.groups" &&
            issue.message.includes("12"),
        ),
      ).toBe(true);
    }
  });

  test("rejects field/operator compatibility violations with structured errors", () => {
    const result = workflowDomainEventTriggerConfigSchema.safeParse({
      triggerType: "DomainEvent",
      domain: "appointment",
      startEvents: ["appointment.scheduled"],
      restartEvents: [],
      stopEvents: [],
      filter: {
        logic: "and",
        groups: [
          {
            logic: "and",
            conditions: [
              {
                field: "internal.secret",
                operator: "equals",
                value: "hidden",
              },
              {
                field: "client.email",
                operator: "contains",
                value: ["example.com"],
              },
              {
                field: "appointment.startsAt",
                operator: "is_set",
                value: "2026-02-16T00:00:00.000Z",
              },
            ],
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issuePaths = result.error.issues.map((issue) =>
        issue.path.join("."),
      );
      expect(issuePaths).toContain("filter.groups.0.conditions.0.field");
      expect(issuePaths).toContain("filter.groups.0.conditions.1.value");
      expect(issuePaths).toContain("filter.groups.0.conditions.2.value");
    }
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
                startEvents: ["appointment.scheduled"],
                restartEvents: ["appointment.rescheduled"],
                stopEvents: ["appointment.rescheduled"],
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
      graph: createLinearJourneyGraph(),
      isEnabled: true,
    });

    const updateResult = updateWorkflowSchema.safeParse({
      isEnabled: false,
    });

    expect(createResult.success).toBe(true);
    expect(updateResult.success).toBe(true);
  });
});

describe("Journey linear validation contracts", () => {
  test("accepts trigger->wait->send message->logger journey chain", () => {
    const result = createWorkflowSchema.safeParse({
      name: "Appointment Reminder Journey",
      graph: createLinearJourneyGraph(),
    });

    expect(result.success).toBe(true);
  });

  test("rejects branching journeys", () => {
    const graph = createLinearJourneyGraph();
    graph.nodes.push({
      key: "extra-logger-step",
      attributes: {
        id: "extra-logger-step",
        position: { x: 720, y: 160 },
        data: {
          label: "Logger branch",
          type: "action",
          config: {
            actionType: "logger",
            message: "Branch",
          },
        },
      },
    });
    graph.edges.push({
      key: "edge-wait-branch",
      source: "wait-step",
      target: "extra-logger-step",
      attributes: {
        id: "edge-wait-branch",
        source: "wait-step",
        target: "extra-logger-step",
      },
    });

    const result = createWorkflowSchema.safeParse({
      name: "Branching Journey",
      graph,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === "graph"),
      ).toBe(true);
    }
  });

  test("rejects unsupported step types", () => {
    const graph = createLinearJourneyGraph();
    const sendStep = graph.nodes.find(
      (node) => node.key === "send-message-step",
    );
    if (sendStep?.attributes.data.type === "action") {
      sendStep.attributes.data.config = {
        actionType: "switch",
      };
    }

    const result = createWorkflowSchema.safeParse({
      name: "Unsupported step journey",
      graph,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("Unsupported step type"),
        ),
      ).toBe(true);
    }
  });
});

describe("Workflow execute input and sample event schemas", () => {
  test("requires eventType and payload for execute input", () => {
    const valid = workflowExecuteInputSchema.safeParse({
      eventType: "appointment.scheduled",
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
