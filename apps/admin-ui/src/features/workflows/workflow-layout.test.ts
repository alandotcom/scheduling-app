import { describe, expect, test } from "bun:test";
import type {
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
} from "./workflow-editor-store";
import { layoutWorkflowNodes } from "./workflow-layout";
import { WORKFLOW_NODE_WIDTH } from "./workflow-node-dimensions";

function createNode(
  id: string,
  type: "trigger" | "action",
): WorkflowCanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {
      type,
      label: id,
    },
  };
}

function createEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
): WorkflowCanvasEdge {
  return {
    id,
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
  };
}

describe("layoutWorkflowNodes", () => {
  test("lays out the graph from top to bottom", async () => {
    const nodes = [createNode("trigger", "trigger"), createNode("a", "action")];
    const edges = [createEdge("e-trigger-a", "trigger", "a")];

    const result = await layoutWorkflowNodes({ nodes, edges });

    const trigger = result.nodes.find((node) => node.id === "trigger");
    const action = result.nodes.find((node) => node.id === "a");

    expect(trigger).toBeDefined();
    expect(action).toBeDefined();
    expect(action!.position.y).toBeGreaterThan(trigger!.position.y);
    expect(result.changed).toBe(true);
  });

  test("keeps linear parent/child centers vertically aligned", async () => {
    const nodes = [createNode("trigger", "trigger"), createNode("a", "action")];
    const edges = [createEdge("e-trigger-a", "trigger", "a")];

    const result = await layoutWorkflowNodes({ nodes, edges });
    const trigger = result.nodes.find((node) => node.id === "trigger");
    const action = result.nodes.find((node) => node.id === "a");

    expect(trigger).toBeDefined();
    expect(action).toBeDefined();
    const triggerCenterX = trigger!.position.x + WORKFLOW_NODE_WIDTH / 2;
    const actionCenterX = action!.position.x + WORKFLOW_NODE_WIDTH / 2;
    expect(action!.position.y).toBeGreaterThan(trigger!.position.y);
    expect(actionCenterX).toBe(triggerCenterX);
  });

  test("returns deterministic positions for the same graph", async () => {
    const nodes = [
      createNode("trigger", "trigger"),
      createNode("c", "action"),
      createNode("b", "action"),
      createNode("a", "action"),
    ];
    const edges = [
      createEdge("e-trigger-a", "trigger", "a"),
      createEdge("e-a-b", "a", "b"),
      createEdge("e-a-c", "a", "c"),
    ];

    const first = (await layoutWorkflowNodes({ nodes, edges })).nodes;
    const second = (await layoutWorkflowNodes({ nodes, edges })).nodes;

    expect(first).toEqual(second);
  });

  test("separates condition branches across horizontal tracks", async () => {
    const nodes = [
      createNode("trigger", "trigger"),
      createNode("condition", "action"),
      createNode("true-node", "action"),
      createNode("false-node", "action"),
    ];

    const edges = [
      createEdge("e-trigger-condition", "trigger", "condition"),
      createEdge("e-condition-true", "condition", "true-node", "true"),
      createEdge("e-condition-false", "condition", "false-node", "false"),
    ];

    const result = await layoutWorkflowNodes({ nodes, edges });
    const condition = result.nodes.find((node) => node.id === "condition");
    const trueNode = result.nodes.find((node) => node.id === "true-node");
    const falseNode = result.nodes.find((node) => node.id === "false-node");

    expect(condition).toBeDefined();
    expect(trueNode).toBeDefined();
    expect(falseNode).toBeDefined();
    expect(trueNode!.position.x).not.toBe(falseNode!.position.x);
    const siblingMidpoint = (trueNode!.position.x + falseNode!.position.x) / 2;
    expect(
      Math.abs(siblingMidpoint - condition!.position.x),
    ).toBeLessThanOrEqual(1);
  });

  test("keeps trigger branches aligned to handle side ordering", async () => {
    const nodes = [
      createNode("trigger", "trigger"),
      createNode("scheduled-node", "action"),
      createNode("canceled-node", "action"),
    ];

    const edges = [
      createEdge(
        "e-trigger-scheduled",
        "trigger",
        "scheduled-node",
        "scheduled",
      ),
      createEdge("e-trigger-canceled", "trigger", "canceled-node", "canceled"),
    ];

    const result = await layoutWorkflowNodes({ nodes, edges });
    const trigger = result.nodes.find((node) => node.id === "trigger");
    const scheduledNode = result.nodes.find(
      (node) => node.id === "scheduled-node",
    );
    const canceledNode = result.nodes.find(
      (node) => node.id === "canceled-node",
    );

    expect(trigger).toBeDefined();
    expect(scheduledNode).toBeDefined();
    expect(canceledNode).toBeDefined();
    expect(scheduledNode!.position.x).toBeLessThan(canceledNode!.position.x);
    const siblingMidpoint =
      (scheduledNode!.position.x + canceledNode!.position.x) / 2;
    expect(Math.abs(siblingMidpoint - trigger!.position.x)).toBeLessThanOrEqual(
      1,
    );
  });

  test("positions disconnected nodes as well", async () => {
    const nodes = [
      createNode("trigger", "trigger"),
      createNode("a", "action"),
      createNode("orphan", "action"),
    ];

    const edges = [createEdge("e-trigger-a", "trigger", "a")];

    const result = await layoutWorkflowNodes({ nodes, edges });
    const orphan = result.nodes.find((node) => node.id === "orphan");

    expect(orphan).toBeDefined();
    expect(Number.isFinite(orphan!.position.x)).toBe(true);
    expect(Number.isFinite(orphan!.position.y)).toBe(true);
  });

  test("returns valid layout for different viewport widths", async () => {
    const nodes = [
      createNode("trigger", "trigger"),
      createNode("a", "action"),
      createNode("b", "action"),
      createNode("c", "action"),
      createNode("d", "action"),
      createNode("e", "action"),
      createNode("f", "action"),
      createNode("g", "action"),
    ];
    const edges = [
      createEdge("e-trigger-a", "trigger", "a"),
      createEdge("e-a-b", "a", "b"),
      createEdge("e-b-c", "b", "c"),
      createEdge("e-c-d", "c", "d"),
      createEdge("e-d-e", "d", "e"),
      createEdge("e-e-f", "e", "f"),
      createEdge("e-f-g", "f", "g"),
    ];

    const narrow = await layoutWorkflowNodes({
      nodes,
      edges,
      availableWidth: 700,
    });
    const wide = await layoutWorkflowNodes({
      nodes,
      edges,
      availableWidth: 1800,
    });

    expect(narrow.changed).toBe(true);
    expect(wide.changed).toBe(true);
    for (const node of narrow.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
    for (const node of wide.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });
});
