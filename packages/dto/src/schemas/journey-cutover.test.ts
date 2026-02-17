import { describe, expect, test } from "bun:test";
import * as schemas from "./index";
import type { LinearJourneyGraph } from "./journey";

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
              actionType: "send-message",
              channel: "email",
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

describe("journey cutover schema exports", () => {
  test("does not expose legacy workflow schema exports", () => {
    expect("createWorkflowSchema" in schemas).toBe(false);
    expect("workflowExecutionSchema" in schemas).toBe(false);
  });

  test("accepts valid linear chain using only supported step set", () => {
    const parsed = schemas.createJourneySchema.safeParse({
      name: "Supported Journey",
      graph: createLinearGraphWithSupportedSteps(),
    });

    expect(parsed.success).toBe(true);
  });

  test("rejects branching payloads for create and update schemas", () => {
    const createParsed = schemas.createJourneySchema.safeParse({
      name: "Branching Journey",
      graph: createBranchingGraph(),
    });
    const updateParsed = schemas.updateJourneySchema.safeParse({
      graph: createBranchingGraph("trigger-branching-update"),
    });

    expect(createParsed.success).toBe(false);
    expect(updateParsed.success).toBe(false);
  });

  test("rejects legacy action aliases outside supported step set", () => {
    const parsed = schemas.createJourneySchema.safeParse({
      name: "Legacy Alias Journey",
      graph: createLegacyAliasStepGraph(),
    });

    expect(parsed.success).toBe(false);
  });
});
