import { describe, expect, test } from "bun:test";
import * as schemas from "./index";
import type { LinearJourneyGraph } from "./journey";

function createTriggerConfig() {
  return {
    triggerType: "AppointmentJourney",
    start: "appointment.scheduled",
    restart: "appointment.rescheduled",
    stop: "appointment.canceled",
    correlationKey: "appointmentId",
  } as const;
}

function createLinearGraphWithSupportedSteps(
  triggerId = "trigger-supported",
): LinearJourneyGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: triggerId,
        attributes: {
          id: triggerId,
          type: "trigger-node",
          position: {
            x: 0,
            y: 0,
          },
          data: {
            label: "Trigger",
            type: "trigger",
            config: createTriggerConfig(),
          },
        },
      },
      {
        key: "wait-step",
        attributes: {
          id: "wait-step",
          type: "action-node",
          position: {
            x: 0,
            y: 120,
          },
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
        key: "send-step",
        attributes: {
          id: "send-step",
          type: "action-node",
          position: {
            x: 0,
            y: 240,
          },
          data: {
            label: "Send Message",
            type: "action",
            config: {
              actionType: "send-resend",
            },
          },
        },
      },
      {
        key: "logger-step",
        attributes: {
          id: "logger-step",
          type: "action-node",
          position: {
            x: 0,
            y: 360,
          },
          data: {
            label: "Logger",
            type: "action",
            config: {
              actionType: "logger",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: `${triggerId}-to-wait-step`,
        source: triggerId,
        target: "wait-step",
        attributes: {
          id: `${triggerId}-to-wait-step`,
          source: triggerId,
          target: "wait-step",
        },
      },
      {
        key: "wait-step-to-send-step",
        source: "wait-step",
        target: "send-step",
        attributes: {
          id: "wait-step-to-send-step",
          source: "wait-step",
          target: "send-step",
        },
      },
      {
        key: "send-step-to-logger-step",
        source: "send-step",
        target: "logger-step",
        attributes: {
          id: "send-step-to-logger-step",
          source: "send-step",
          target: "logger-step",
        },
      },
    ],
  };
}

function createBranchingGraph(
  triggerId = "trigger-branching",
): LinearJourneyGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: triggerId,
        attributes: {
          id: triggerId,
          type: "trigger-node",
          position: {
            x: 0,
            y: 0,
          },
          data: {
            label: "Trigger",
            type: "trigger",
            config: createTriggerConfig(),
          },
        },
      },
      {
        key: "wait-step",
        attributes: {
          id: "wait-step",
          type: "action-node",
          position: {
            x: -80,
            y: 120,
          },
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
        key: "logger-step",
        attributes: {
          id: "logger-step",
          type: "action-node",
          position: {
            x: 80,
            y: 120,
          },
          data: {
            label: "Logger",
            type: "action",
            config: {
              actionType: "logger",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: `${triggerId}-to-wait-step`,
        source: triggerId,
        target: "wait-step",
        attributes: {
          id: `${triggerId}-to-wait-step`,
          source: triggerId,
          target: "wait-step",
          data: { triggerBranch: "scheduled" },
        },
      },
      {
        key: `${triggerId}-to-logger-step`,
        source: triggerId,
        target: "logger-step",
        attributes: {
          id: `${triggerId}-to-logger-step`,
          source: triggerId,
          target: "logger-step",
          data: { triggerBranch: "canceled" },
        },
      },
    ],
  };
}

function createLegacyAliasStepGraph(
  triggerId = "trigger-legacy",
): LinearJourneyGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: triggerId,
        attributes: {
          id: triggerId,
          type: "trigger-node",
          position: {
            x: 0,
            y: 0,
          },
          data: {
            label: "Trigger",
            type: "trigger",
            config: createTriggerConfig(),
          },
        },
      },
      {
        key: "legacy-send-step",
        attributes: {
          id: "legacy-send-step",
          type: "action-node",
          position: {
            x: 0,
            y: 120,
          },
          data: {
            label: "Legacy Email",
            type: "action",
            config: {
              actionType: "email",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: `${triggerId}-to-legacy-send-step`,
        source: triggerId,
        target: "legacy-send-step",
        attributes: {
          id: `${triggerId}-to-legacy-send-step`,
          source: triggerId,
          target: "legacy-send-step",
        },
      },
    ],
  };
}

function createConditionGraph(
  triggerId = "trigger-condition",
): LinearJourneyGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: triggerId,
        attributes: {
          id: triggerId,
          type: "trigger-node",
          position: { x: 0, y: 0 },
          data: {
            label: "Trigger",
            type: "trigger",
            config: createTriggerConfig(),
          },
        },
      },
      {
        key: "condition-step",
        attributes: {
          id: "condition-step",
          type: "action-node",
          position: { x: 0, y: 120 },
          data: {
            label: "Condition",
            type: "action",
            config: {
              actionType: "condition",
              expression: 'appointment.status == "scheduled"',
            },
          },
        },
      },
      {
        key: "send-true",
        attributes: {
          id: "send-true",
          type: "action-node",
          position: { x: -120, y: 260 },
          data: {
            label: "Send True",
            type: "action",
            config: {
              actionType: "send-resend",
            },
          },
        },
      },
      {
        key: "send-false",
        attributes: {
          id: "send-false",
          type: "action-node",
          position: { x: 120, y: 260 },
          data: {
            label: "Send False",
            type: "action",
            config: {
              actionType: "send-slack",
            },
          },
        },
      },
    ],
    edges: [
      {
        key: `${triggerId}-to-condition-step`,
        source: triggerId,
        target: "condition-step",
        attributes: {
          id: `${triggerId}-to-condition-step`,
          source: triggerId,
          target: "condition-step",
        },
      },
      {
        key: "condition-step-to-send-true",
        source: "condition-step",
        target: "send-true",
        attributes: {
          id: "condition-step-to-send-true",
          source: "condition-step",
          target: "send-true",
          label: "True",
          data: { conditionBranch: "true" },
        },
      },
      {
        key: "condition-step-to-send-false",
        source: "condition-step",
        target: "send-false",
        attributes: {
          id: "condition-step-to-send-false",
          source: "condition-step",
          target: "send-false",
          label: "False",
          data: { conditionBranch: "false" },
        },
      },
    ],
  };
}

describe("journey cutover schema exports", () => {
  test("does not expose legacy workflow schema exports", () => {
    expect("createWorkflowSchema" in schemas).toBe(false);
    expect("workflowExecutionSchema" in schemas).toBe(false);
    expect("serializedWorkflowGraphSchema" in schemas).toBe(false);
    expect("workflowDomainEventTriggerConfigSchema" in schemas).toBe(false);
  });

  test("accepts valid linear chain using only supported step set", () => {
    const parsed = schemas.createJourneySchema.safeParse({
      name: "Supported Journey",
      graph: createLinearGraphWithSupportedSteps(),
    });

    expect(parsed.success).toBe(true);
  });

  test("accepts condition routing with explicit true/false branches", () => {
    const parsed = schemas.createJourneySchema.safeParse({
      name: "Condition Journey",
      graph: createConditionGraph(),
    });

    expect(parsed.success).toBe(true);
  });

  test("accepts fan-out branching payloads for create and update schemas", () => {
    const createParsed = schemas.createJourneySchema.safeParse({
      name: "Branching Journey",
      graph: createBranchingGraph(),
    });
    const updateParsed = schemas.updateJourneySchema.safeParse({
      graph: createBranchingGraph("trigger-branching-update"),
    });

    expect(createParsed.success).toBe(true);
    expect(updateParsed.success).toBe(true);
  });

  test("rejects unlabeled condition edges", () => {
    const graph = createConditionGraph("trigger-condition-unlabeled");
    const conditionEdges = graph.edges.filter(
      (edge) => edge.source === "condition-step",
    );
    for (const edge of conditionEdges) {
      delete edge.attributes["label"];
      delete edge.attributes["data"];
    }

    const parsed = schemas.createJourneySchema.safeParse({
      name: "Unlabeled Condition Journey",
      graph,
    });

    expect(parsed.success).toBe(false);
  });

  test("rejects duplicate condition branch labels", () => {
    const graph = createConditionGraph("trigger-condition-duplicate-branch");
    const falseEdge = graph.edges.find(
      (edge) => edge.key === "condition-step-to-send-false",
    );

    if (falseEdge) {
      falseEdge.attributes["label"] = "true";
      falseEdge.attributes["data"] = { conditionBranch: "true" };
    }

    const parsed = schemas.createJourneySchema.safeParse({
      name: "Duplicate Condition Branch Journey",
      graph,
    });

    expect(parsed.success).toBe(false);
  });

  test("rejects legacy action aliases outside supported step set", () => {
    const parsed = schemas.createJourneySchema.safeParse({
      name: "Legacy Alias Journey",
      graph: createLegacyAliasStepGraph(),
    });

    expect(parsed.success).toBe(false);
  });

  test("accepts graph with trigger branch edges", () => {
    const graph = createBranchingGraph("trigger-branch-test");
    const parsed = schemas.createJourneySchema.safeParse({
      name: "Trigger Branch Journey",
      graph,
    });

    expect(parsed.success).toBe(true);
  });

  test("rejects wait node on canceled branch", () => {
    const graph: LinearJourneyGraph = {
      attributes: {},
      options: { type: "directed" },
      nodes: [
        {
          key: "trigger",
          attributes: {
            id: "trigger",
            type: "trigger-node",
            position: { x: 0, y: 0 },
            data: {
              label: "Trigger",
              type: "trigger",
              config: createTriggerConfig(),
            },
          },
        },
        {
          key: "logger-step",
          attributes: {
            id: "logger-step",
            type: "action-node",
            position: { x: -80, y: 120 },
            data: {
              label: "Logger",
              type: "action",
              config: { actionType: "logger" },
            },
          },
        },
        {
          key: "wait-step",
          attributes: {
            id: "wait-step",
            type: "action-node",
            position: { x: 80, y: 120 },
            data: {
              label: "Wait",
              type: "action",
              config: { actionType: "wait" },
            },
          },
        },
      ],
      edges: [
        {
          key: "trigger-to-logger",
          source: "trigger",
          target: "logger-step",
          attributes: {
            id: "trigger-to-logger",
            source: "trigger",
            target: "logger-step",
            data: { triggerBranch: "scheduled" },
          },
        },
        {
          key: "trigger-to-wait",
          source: "trigger",
          target: "wait-step",
          attributes: {
            id: "trigger-to-wait",
            source: "trigger",
            target: "wait-step",
            data: { triggerBranch: "canceled" },
          },
        },
      ],
    };

    const parsed = schemas.createJourneySchema.safeParse({
      name: "Wait On Cancel Branch",
      graph,
    });

    expect(parsed.success).toBe(false);
  });

  test("rejects wait-for-confirmation node on canceled branch", () => {
    const graph: LinearJourneyGraph = {
      attributes: {},
      options: { type: "directed" },
      nodes: [
        {
          key: "trigger",
          attributes: {
            id: "trigger",
            type: "trigger-node",
            position: { x: 0, y: 0 },
            data: {
              label: "Trigger",
              type: "trigger",
              config: createTriggerConfig(),
            },
          },
        },
        {
          key: "logger-step",
          attributes: {
            id: "logger-step",
            type: "action-node",
            position: { x: -80, y: 120 },
            data: {
              label: "Logger",
              type: "action",
              config: { actionType: "logger" },
            },
          },
        },
        {
          key: "wait-confirmation-step",
          attributes: {
            id: "wait-confirmation-step",
            type: "action-node",
            position: { x: 80, y: 120 },
            data: {
              label: "Wait For Confirmation",
              type: "action",
              config: {
                actionType: "wait-for-confirmation",
                confirmationGraceMinutes: 0,
              },
            },
          },
        },
      ],
      edges: [
        {
          key: "trigger-to-logger",
          source: "trigger",
          target: "logger-step",
          attributes: {
            id: "trigger-to-logger",
            source: "trigger",
            target: "logger-step",
            data: { triggerBranch: "scheduled" },
          },
        },
        {
          key: "trigger-to-wait-confirmation",
          source: "trigger",
          target: "wait-confirmation-step",
          attributes: {
            id: "trigger-to-wait-confirmation",
            source: "trigger",
            target: "wait-confirmation-step",
            data: { triggerBranch: "canceled" },
          },
        },
      ],
    };

    const parsed = schemas.createJourneySchema.safeParse({
      name: "Wait For Confirmation On Cancel Branch",
      graph,
    });

    expect(parsed.success).toBe(false);
  });

  test("accepts trigger with only scheduled branch", () => {
    const graph: LinearJourneyGraph = {
      attributes: {},
      options: { type: "directed" },
      nodes: [
        {
          key: "trigger",
          attributes: {
            id: "trigger",
            type: "trigger-node",
            position: { x: 0, y: 0 },
            data: {
              label: "Trigger",
              type: "trigger",
              config: createTriggerConfig(),
            },
          },
        },
        {
          key: "logger-step",
          attributes: {
            id: "logger-step",
            type: "action-node",
            position: { x: 0, y: 120 },
            data: {
              label: "Logger",
              type: "action",
              config: { actionType: "logger" },
            },
          },
        },
      ],
      edges: [
        {
          key: "trigger-to-logger",
          source: "trigger",
          target: "logger-step",
          attributes: {
            id: "trigger-to-logger",
            source: "trigger",
            target: "logger-step",
            data: { triggerBranch: "scheduled" },
          },
        },
      ],
    };

    const parsed = schemas.createJourneySchema.safeParse({
      name: "Single Scheduled Branch",
      graph,
    });

    expect(parsed.success).toBe(true);
  });

  test("accepts trigger with no branch labels (backwards compat)", () => {
    const graph = createLinearGraphWithSupportedSteps("trigger-no-labels");
    const parsed = schemas.createJourneySchema.safeParse({
      name: "No Branch Labels Journey",
      graph,
    });

    expect(parsed.success).toBe(true);
  });

  test("rejects legacy trigger routing shape", () => {
    const legacyTriggerGraph = createLinearGraphWithSupportedSteps(
      "trigger-legacy-routing",
    );
    const [triggerNode] = legacyTriggerGraph.nodes;
    if (triggerNode?.attributes.data.type === "trigger") {
      triggerNode.attributes.data.config = {
        triggerType: "DomainEvent",
        domain: "appointment",
        startEvents: ["appointment.scheduled"],
        restartEvents: ["appointment.rescheduled"],
        stopEvents: ["appointment.canceled"],
      };
    }

    const parsed = schemas.createJourneySchema.safeParse({
      name: "Legacy Trigger Journey",
      graph: legacyTriggerGraph,
    });

    expect(parsed.success).toBe(false);
  });
});
