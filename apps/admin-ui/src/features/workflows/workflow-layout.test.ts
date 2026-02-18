import { describe, expect, test } from "bun:test";
import type {
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
} from "./workflow-editor-store";
import { layoutWorkflowNodes } from "./workflow-layout";

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
  test("lays out the graph from left to right", () => {
    const nodes = [createNode("trigger", "trigger"), createNode("a", "action")];
    const edges = [createEdge("e-trigger-a", "trigger", "a")];

    const result = layoutWorkflowNodes({ nodes, edges });

    const trigger = result.nodes.find((node) => node.id === "trigger");
    const action = result.nodes.find((node) => node.id === "a");

    expect(trigger).toBeDefined();
    expect(action).toBeDefined();
    expect(action!.position.x).toBeGreaterThan(trigger!.position.x);
    expect(result.changed).toBe(true);
  });

  test("returns deterministic positions for the same graph", () => {
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

    const first = layoutWorkflowNodes({ nodes, edges }).nodes;
    const second = layoutWorkflowNodes({ nodes, edges }).nodes;

    expect(first).toEqual(second);
  });

  test("separates condition branches across vertical tracks", () => {
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

    const result = layoutWorkflowNodes({ nodes, edges });
    const trueNode = result.nodes.find((node) => node.id === "true-node");
    const falseNode = result.nodes.find((node) => node.id === "false-node");

    expect(trueNode).toBeDefined();
    expect(falseNode).toBeDefined();
    expect(trueNode!.position.y).not.toBe(falseNode!.position.y);
  });

  test("positions disconnected nodes as well", () => {
    const nodes = [
      createNode("trigger", "trigger"),
      createNode("a", "action"),
      createNode("orphan", "action"),
    ];

    const edges = [createEdge("e-trigger-a", "trigger", "a")];

    const result = layoutWorkflowNodes({ nodes, edges });
    const orphan = result.nodes.find((node) => node.id === "orphan");

    expect(orphan).toBeDefined();
    expect(Number.isFinite(orphan!.position.x)).toBe(true);
    expect(Number.isFinite(orphan!.position.y)).toBe(true);
  });
});
