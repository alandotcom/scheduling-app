/// <reference lib="dom" />

import { describe, expect, test } from "bun:test";
import type { SerializedWorkflowGraph } from "@scheduling/dto";
import { createStore } from "jotai";
import {
  deserializeWorkflowGraph,
  onWorkflowEditorNodesChangeAtom,
  serializeWorkflowGraph,
  setWorkflowEditorGraphAtom,
  updateWorkflowEditorNodeDataAtom,
  workflowEditorHasUnsavedChangesAtom,
  workflowEditorIsReadOnlyAtom,
  workflowEditorNodesAtom,
} from "./workflow-editor-store";

function createGraphFixture(): SerializedWorkflowGraph {
  return {
    attributes: {},
    options: { type: "directed", allowSelfLoops: false, multi: false },
    nodes: [
      {
        key: "trigger-node",
        attributes: {
          id: "trigger-node",
          type: "trigger",
          position: { x: 100, y: 120 },
          data: {
            type: "trigger",
            label: "Trigger",
            status: "idle",
            config: {
              triggerType: "DomainEvent",
              startEvents: [],
              restartEvents: [],
              stopEvents: [],
            },
          },
        },
      },
      {
        key: "action-node",
        attributes: {
          id: "action-node",
          type: "action",
          position: { x: 320, y: 140 },
          data: {
            type: "action",
            label: "Action",
            status: "idle",
            config: {},
          },
        },
      },
    ],
    edges: [
      {
        key: "edge-1",
        source: "trigger-node",
        target: "action-node",
        undirected: false,
        attributes: {
          id: "edge-1",
          source: "trigger-node",
          target: "action-node",
          type: "default",
        },
      },
    ],
  };
}

describe("workflow-editor-store", () => {
  test("serializes and deserializes workflow graph state", () => {
    const fixture = createGraphFixture();
    const state = deserializeWorkflowGraph(fixture);
    const serialized = serializeWorkflowGraph(state);

    expect(serialized.nodes.length).toBe(2);
    expect(serialized.edges.length).toBe(1);
    expect(serialized.nodes[0]?.attributes.data.label).toBe("Trigger");
    expect(serialized.edges[0]?.attributes.source).toBe("trigger-node");
  });

  test("does not remove trigger nodes on node remove changes", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(onWorkflowEditorNodesChangeAtom, [
      {
        id: "trigger-node",
        type: "remove",
      },
    ]);

    const nodes = store.get(workflowEditorNodesAtom);
    expect(nodes.some((node) => node.id === "trigger-node")).toBe(true);
    expect(store.get(workflowEditorHasUnsavedChangesAtom)).toBe(true);
  });

  test("blocks node data updates while read-only", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, true);

    store.set(updateWorkflowEditorNodeDataAtom, {
      id: "action-node",
      data: { label: "Changed" },
    });

    const actionNode = store
      .get(workflowEditorNodesAtom)
      .find((node) => node.id === "action-node");

    expect(actionNode?.data.label).toBe("Action");
    expect(store.get(workflowEditorHasUnsavedChangesAtom)).toBe(false);
  });
});
