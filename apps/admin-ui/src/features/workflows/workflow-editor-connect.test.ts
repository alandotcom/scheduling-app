import { describe, expect, test } from "bun:test";
import type { Connection } from "@xyflow/react";
import { createStore } from "jotai";
import {
  onWorkflowEditorConnectAtom,
  workflowEditorEdgesAtom,
  workflowEditorIsReadOnlyAtom,
  workflowEditorSelectedEdgeIdAtom,
} from "./workflow-editor-store";

function connect(
  connection: Omit<Connection, "sourceHandle" | "targetHandle">,
): Connection {
  return {
    ...connection,
    sourceHandle: null,
    targetHandle: null,
  };
}

describe("workflow-editor onConnect behavior", () => {
  test("adds a new edge when no edge is selected", () => {
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
    expect(edges).toHaveLength(2);
    expect(
      edges.some(
        (edge) => edge.source === "trigger" && edge.target === "action-a",
      ),
    ).toBeTrue();
    expect(
      edges.some(
        (edge) => edge.source === "trigger" && edge.target === "action-b",
      ),
    ).toBeTrue();
  });

  test("keeps creating outgoing edge even when an edge is selected", () => {
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
    expect(edges).toHaveLength(2);
    expect(
      edges.some((edge) => edge.id === "edge-1" && edge.target === "action-a"),
    ).toBeTrue();
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
});
