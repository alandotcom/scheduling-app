/// <reference lib="dom" />

import { describe, expect, test } from "bun:test";
import type { SerializedWorkflowGraph } from "@scheduling/dto";
import { createStore } from "jotai";
import {
  deleteNodeAtom,
  deserializeWorkflowGraph,
  onWorkflowEditorNodesChangeAtom,
  setWorkflowEditorActionTypeAtom,
  serializeWorkflowGraph,
  setWorkflowEditorGraphAtom,
  updateWorkflowEditorNodeDataAtom,
  workflowEditorEdgesAtom,
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
              domain: "appointment",
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
          label: "Start",
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
    expect(serialized.edges[0]?.attributes.label).toBe("Start");
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

  test("creates created/updated/deleted branches when setting action type to switch", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(setWorkflowEditorActionTypeAtom, {
      nodeId: "action-node",
      actionType: "switch",
    });

    const nodes = store.get(workflowEditorNodesAtom);
    const edges = store.get(workflowEditorEdgesAtom);
    const switchNode = nodes.find((node) => node.id === "action-node");

    expect(switchNode?.data.config).toMatchObject({ actionType: "switch" });
    expect(nodes.length).toBe(5);

    const switchBranchEdges = edges.filter((edge) => {
      if (edge.source !== "action-node") {
        return false;
      }

      if (!edge.data || typeof edge.data !== "object") {
        return false;
      }

      return "switchBranch" in edge.data;
    });

    const branchNames = switchBranchEdges
      .map((edge) => {
        if (!edge.data || typeof edge.data !== "object") {
          return null;
        }

        return typeof edge.data.switchBranch === "string"
          ? edge.data.switchBranch
          : null;
      })
      .filter((value): value is string => value !== null)
      .sort();

    const branchLabels = switchBranchEdges
      .map((edge) =>
        typeof edge.label === "string" && edge.label.length > 0
          ? edge.label
          : null,
      )
      .filter((value): value is string => value !== null)
      .sort();

    expect(branchNames).toEqual(["created", "deleted", "updated"]);
    expect(branchLabels).toEqual(["Created", "Deleted", "Updated"]);
  });

  test("deleting a switch node also deletes its branch child nodes", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(setWorkflowEditorActionTypeAtom, {
      nodeId: "action-node",
      actionType: "switch",
    });

    store.set(deleteNodeAtom, "action-node");

    const remainingNodeIds = store
      .get(workflowEditorNodesAtom)
      .map((node) => node.id)
      .sort();
    const remainingEdges = store.get(workflowEditorEdgesAtom);

    expect(remainingNodeIds).toEqual(["trigger-node"]);
    expect(remainingEdges).toHaveLength(0);
  });

  test("node remove changes cascade switch branch child nodes", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(setWorkflowEditorActionTypeAtom, {
      nodeId: "action-node",
      actionType: "switch",
    });

    store.set(onWorkflowEditorNodesChangeAtom, [
      {
        id: "action-node",
        type: "remove",
      },
    ]);

    const remainingNodeIds = store
      .get(workflowEditorNodesAtom)
      .map((node) => node.id)
      .sort();
    const remainingEdges = store.get(workflowEditorEdgesAtom);

    expect(remainingNodeIds).toEqual(["trigger-node"]);
    expect(remainingEdges).toHaveLength(0);
  });
});
