import { describe, expect, test } from "bun:test";
import type { Connection } from "@xyflow/react";
import { createStore } from "jotai";
import {
  onWorkflowEditorConnectAtom,
  workflowEditorEdgesAtom,
  workflowEditorIsReadOnlyAtom,
  workflowEditorNodesAtom,
  workflowEditorSelectedEdgeIdAtom,
} from "./workflow-editor-store";

function connect(
  connection: Omit<Connection, "sourceHandle" | "targetHandle"> & {
    sourceHandle?: string | null;
    targetHandle?: string | null;
  },
): Connection {
  return {
    ...connection,
    sourceHandle: connection.sourceHandle ?? null,
    targetHandle: connection.targetHandle ?? null,
  };
}

describe("workflow-editor onConnect behavior", () => {
  test("replaces outgoing edge when source already has a connection", () => {
    const store = createStore();
    store.set(workflowEditorIsReadOnlyAtom, false);
    store.set(workflowEditorEdgesAtom, [
      { id: "edge-1", source: "trigger", target: "action-a" },
    ]);

    store.set(
      onWorkflowEditorConnectAtom,
      connect({ source: "trigger", target: "action-b" }),
    );

    const edges = store.get(workflowEditorEdgesAtom);
    expect(edges).toHaveLength(1);
    expect(
      edges.some(
        (edge) => edge.source === "trigger" && edge.target === "action-b",
      ),
    ).toBeTrue();
  });

  test("replaces outgoing edge even when an edge is selected", () => {
    const store = createStore();
    store.set(workflowEditorIsReadOnlyAtom, false);
    store.set(workflowEditorEdgesAtom, [
      { id: "edge-1", source: "trigger", target: "action-a" },
    ]);
    store.set(workflowEditorSelectedEdgeIdAtom, "edge-1");

    store.set(
      onWorkflowEditorConnectAtom,
      connect({ source: "trigger", target: "action-b" }),
    );

    const edges = store.get(workflowEditorEdgesAtom);
    expect(edges).toHaveLength(1);
    expect(
      edges.some(
        (edge) => edge.source === "trigger" && edge.target === "action-b",
      ),
    ).toBeTrue();
  });

  test("reconnects existing incoming edge on target handle", () => {
    const store = createStore();
    store.set(workflowEditorIsReadOnlyAtom, false);
    store.set(workflowEditorEdgesAtom, [
      { id: "edge-1", source: "trigger", target: "action-a" },
    ]);

    store.set(
      onWorkflowEditorConnectAtom,
      connect({ source: "action-b", target: "action-a" }),
    );

    const edges = store.get(workflowEditorEdgesAtom);
    expect(edges).toHaveLength(1);
    expect(edges[0]?.id).toBe("edge-1");
    expect(edges[0]?.source).toBe("action-b");
    expect(edges[0]?.target).toBe("action-a");
  });

  test("allows condition nodes to keep one edge per branch handle", () => {
    const store = createStore();
    store.set(workflowEditorIsReadOnlyAtom, false);
    store.set(workflowEditorNodesAtom, [
      {
        id: "condition",
        type: "action",
        position: { x: 0, y: 0 },
        data: {
          type: "action",
          label: "Condition",
          config: { actionType: "condition", expression: "true" },
        },
      },
      {
        id: "action-a",
        type: "action",
        position: { x: 0, y: 0 },
        data: { type: "action", label: "A", config: {} },
      },
      {
        id: "action-b",
        type: "action",
        position: { x: 0, y: 0 },
        data: { type: "action", label: "B", config: {} },
      },
    ]);

    store.set(
      onWorkflowEditorConnectAtom,
      connect({
        source: "condition",
        target: "action-a",
        sourceHandle: "true",
      }),
    );
    store.set(
      onWorkflowEditorConnectAtom,
      connect({
        source: "condition",
        target: "action-b",
        sourceHandle: "false",
      }),
    );

    const edges = store.get(workflowEditorEdgesAtom);
    const outgoing = edges.filter((edge) => edge.source === "condition");
    expect(outgoing).toHaveLength(2);
    expect(outgoing.some((edge) => edge.sourceHandle === "true")).toBeTrue();
    expect(outgoing.some((edge) => edge.sourceHandle === "false")).toBeTrue();
  });

  test("infers condition branch when source handle id is missing", () => {
    const store = createStore();
    store.set(workflowEditorIsReadOnlyAtom, false);
    store.set(workflowEditorNodesAtom, [
      {
        id: "condition",
        type: "action",
        position: { x: 0, y: 0 },
        data: {
          type: "action",
          label: "Condition",
          config: { actionType: "condition", expression: "true" },
        },
      },
      {
        id: "action-a",
        type: "action",
        position: { x: 0, y: 0 },
        data: { type: "action", label: "A", config: {} },
      },
      {
        id: "action-b",
        type: "action",
        position: { x: 0, y: 0 },
        data: { type: "action", label: "B", config: {} },
      },
    ]);

    store.set(
      onWorkflowEditorConnectAtom,
      connect({
        source: "condition",
        target: "action-a",
      }),
    );
    store.set(
      onWorkflowEditorConnectAtom,
      connect({
        source: "condition",
        target: "action-b",
      }),
    );

    const edges = store.get(workflowEditorEdgesAtom);
    const outgoing = edges.filter((edge) => edge.source === "condition");
    expect(outgoing).toHaveLength(2);
    expect(outgoing.some((edge) => edge.sourceHandle === "true")).toBeTrue();
    expect(outgoing.some((edge) => edge.sourceHandle === "false")).toBeTrue();
  });

  test("normalizes legacy condition handle ids", () => {
    const store = createStore();
    store.set(workflowEditorIsReadOnlyAtom, false);
    store.set(workflowEditorNodesAtom, [
      {
        id: "condition",
        type: "action",
        position: { x: 0, y: 0 },
        data: {
          type: "action",
          label: "Condition",
          config: { actionType: "condition", expression: "true" },
        },
      },
      {
        id: "action-a",
        type: "action",
        position: { x: 0, y: 0 },
        data: { type: "action", label: "A", config: {} },
      },
      {
        id: "action-b",
        type: "action",
        position: { x: 0, y: 0 },
        data: { type: "action", label: "B", config: {} },
      },
    ]);

    store.set(
      onWorkflowEditorConnectAtom,
      connect({
        source: "condition",
        target: "action-a",
        sourceHandle: "branch-false",
      }),
    );
    store.set(
      onWorkflowEditorConnectAtom,
      connect({
        source: "condition",
        target: "action-b",
        sourceHandle: "branch-true",
      }),
    );

    const edges = store.get(workflowEditorEdgesAtom);
    const outgoing = edges.filter((edge) => edge.source === "condition");
    expect(outgoing).toHaveLength(2);
    expect(
      outgoing.find((edge) => edge.target === "action-a")?.sourceHandle,
    ).toBe("false");
    expect(
      outgoing.find((edge) => edge.target === "action-b")?.sourceHandle,
    ).toBe("true");
  });
});
