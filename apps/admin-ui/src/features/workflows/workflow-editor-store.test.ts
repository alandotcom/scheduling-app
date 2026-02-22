/// <reference lib="dom" />

import { describe, expect, test } from "bun:test";
import {
  linearJourneyGraphSchema,
  type SerializedJourneyGraph,
} from "@scheduling/dto";
import { createStore } from "jotai";
import {
  addWorkflowEditorNodeAtom,
  buildPersistableWorkflowGraph,
  clearWorkflowEditorSelectionAtom,
  deleteEdgeAtom,
  deserializeWorkflowGraph,
  onWorkflowEditorConnectAtom,
  onWorkflowEditorEdgesChangeAtom,
  onWorkflowEditorNodesChangeAtom,
  setWorkflowEditorSelectionAtom,
  setWorkflowEditorActionTypeAtom,
  serializeWorkflowGraph,
  setWorkflowEditorGraphAtom,
  updateWorkflowEditorNodeDataAtom,
  workflowActiveCanvasEdgesAtom,
  workflowActiveCanvasNodesAtom,
  workflowEditorEdgesAtom,
  workflowEditorHasUnsavedChangesAtom,
  workflowEditorIsReadOnlyAtom,
  workflowEditorNodesAtom,
  workflowEditorSelectedEdgeIdAtom,
  workflowEditorSelectedNodeIdAtom,
  workflowExecutionViewGraphAtom,
} from "./workflow-editor-store";

function createGraphFixture(): SerializedJourneyGraph {
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
              triggerType: "AppointmentJourney",
              start: "appointment.scheduled",
              restart: "appointment.rescheduled",
              stop: "appointment.canceled",
              correlationKey: "appointmentId",
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

function createPersistableGraphFixture(): SerializedJourneyGraph {
  const fixture = createGraphFixture();
  const triggerNode = fixture.nodes[0];
  const actionNode = fixture.nodes[1];
  if (
    !triggerNode ||
    !actionNode ||
    actionNode.attributes.data.type !== "action"
  ) {
    throw new Error("Expected action node fixture");
  }

  return {
    ...fixture,
    nodes: [
      triggerNode,
      {
        ...actionNode,
        attributes: {
          ...actionNode.attributes,
          data: {
            ...actionNode.attributes.data,
            config: { actionType: "send-slack" },
          },
        },
      },
    ],
  };
}

function createGraphFixtureWithIncompleteMiddleAction(): SerializedJourneyGraph {
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
              triggerType: "AppointmentJourney",
              start: "appointment.scheduled",
              restart: "appointment.rescheduled",
              stop: "appointment.canceled",
              correlationKey: "appointmentId",
            },
          },
        },
      },
      {
        key: "incomplete-action",
        attributes: {
          id: "incomplete-action",
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
      {
        key: "downstream-action",
        attributes: {
          id: "downstream-action",
          type: "action",
          position: { x: 560, y: 140 },
          data: {
            type: "action",
            label: "Slack",
            status: "idle",
            config: { actionType: "send-slack" },
          },
        },
      },
    ],
    edges: [
      {
        key: "edge-trigger-incomplete",
        source: "trigger-node",
        target: "incomplete-action",
        undirected: false,
        attributes: {
          id: "edge-trigger-incomplete",
          source: "trigger-node",
          target: "incomplete-action",
        },
      },
      {
        key: "edge-incomplete-downstream",
        source: "incomplete-action",
        target: "downstream-action",
        undirected: false,
        attributes: {
          id: "edge-incomplete-downstream",
          source: "incomplete-action",
          target: "downstream-action",
        },
      },
    ],
  };
}

function createConditionMissingExpressionFixture(): SerializedJourneyGraph {
  const fixture = createPersistableGraphFixture();
  const triggerNode = fixture.nodes[0];
  const actionNode = fixture.nodes[1];
  if (
    !triggerNode ||
    !actionNode ||
    actionNode.attributes.data.type !== "action"
  ) {
    throw new Error("Expected action node fixture");
  }

  return {
    ...fixture,
    nodes: [
      triggerNode,
      {
        ...actionNode,
        attributes: {
          ...actionNode.attributes,
          data: {
            ...actionNode.attributes.data,
            config: {
              actionType: "condition",
              expression: "   ",
            },
          },
        },
      },
    ],
  };
}

function createGraphFixtureWithSecondAction(): SerializedJourneyGraph {
  const fixture = createGraphFixture();
  return {
    ...fixture,
    nodes: [
      ...fixture.nodes,
      {
        key: "action-node-2",
        attributes: {
          id: "action-node-2",
          type: "action",
          position: { x: 520, y: 140 },
          data: {
            type: "action",
            label: "Action 2",
            status: "idle",
            config: {},
          },
        },
      },
    ],
  };
}

function createCanceledBranchActionGraphFixture(): SerializedJourneyGraph {
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
              triggerType: "AppointmentJourney",
              start: "appointment.scheduled",
              restart: "appointment.rescheduled",
              stop: "appointment.canceled",
              correlationKey: "appointmentId",
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
        key: "edge-canceled",
        source: "trigger-node",
        target: "action-node",
        undirected: false,
        attributes: {
          id: "edge-canceled",
          source: "trigger-node",
          target: "action-node",
          sourceHandle: "canceled",
          label: "Canceled",
          data: { triggerBranch: "canceled" },
        },
      },
    ],
  };
}

function createNoShowBranchActionGraphFixture(): SerializedJourneyGraph {
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
              triggerType: "AppointmentJourney",
              start: "appointment.scheduled",
              restart: "appointment.rescheduled",
              stop: "appointment.canceled",
              correlationKey: "appointmentId",
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
        key: "edge-no-show",
        source: "trigger-node",
        target: "action-node",
        undirected: false,
        attributes: {
          id: "edge-no-show",
          source: "trigger-node",
          target: "action-node",
          sourceHandle: "no_show",
          label: "No Show",
          data: { triggerBranch: "no_show" },
        },
      },
    ],
  };
}

function createStaleClientTriggerGraphFixture(): SerializedJourneyGraph {
  const fixture = createGraphFixture();
  const triggerNode = fixture.nodes[0];
  const firstEdge = fixture.edges[0];
  if (!triggerNode || !firstEdge) {
    throw new Error("Expected trigger graph fixture");
  }

  return {
    ...fixture,
    nodes: [
      {
        ...triggerNode,
        attributes: {
          ...triggerNode.attributes,
          data: {
            ...triggerNode.attributes.data,
            config: {
              triggerType: "ClientJourney",
              event: "client.created",
              correlationKey: "clientId",
            },
          },
        },
      },
      ...fixture.nodes.slice(1),
    ],
    edges: [
      {
        ...firstEdge,
        attributes: {
          ...firstEdge.attributes,
          sourceHandle: "scheduled",
          label: "Scheduled",
          data: { triggerBranch: "scheduled" },
        },
      },
    ],
  };
}

function createConditionGraphFixture(): SerializedJourneyGraph {
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
              triggerType: "AppointmentJourney",
              start: "appointment.scheduled",
              restart: "appointment.rescheduled",
              stop: "appointment.canceled",
              correlationKey: "appointmentId",
            },
          },
        },
      },
      {
        key: "condition-node",
        attributes: {
          id: "condition-node",
          type: "action",
          position: { x: 320, y: 140 },
          data: {
            type: "action",
            label: "Condition",
            status: "idle",
            config: {
              actionType: "condition",
              expression: "true",
            },
          },
        },
      },
      {
        key: "action-node-a",
        attributes: {
          id: "action-node-a",
          type: "action",
          position: { x: 520, y: 80 },
          data: {
            type: "action",
            label: "A",
            status: "idle",
            config: {},
          },
        },
      },
      {
        key: "action-node-b",
        attributes: {
          id: "action-node-b",
          type: "action",
          position: { x: 520, y: 220 },
          data: {
            type: "action",
            label: "B",
            status: "idle",
            config: {},
          },
        },
      },
      {
        key: "action-node-c",
        attributes: {
          id: "action-node-c",
          type: "action",
          position: { x: 520, y: 340 },
          data: {
            type: "action",
            label: "C",
            status: "idle",
            config: {},
          },
        },
      },
    ],
    edges: [
      {
        key: "edge-trigger-condition",
        source: "trigger-node",
        target: "condition-node",
        undirected: false,
        attributes: {
          id: "edge-trigger-condition",
          source: "trigger-node",
          target: "condition-node",
        },
      },
      {
        key: "edge-condition-true",
        source: "condition-node",
        target: "action-node-a",
        undirected: false,
        attributes: {
          id: "edge-condition-true",
          source: "condition-node",
          target: "action-node-a",
          sourceHandle: "true",
          label: "True",
          data: { conditionBranch: "true" },
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

  test("normalizes invalid client trigger configs to canonical client defaults", () => {
    const fixture = createGraphFixture();
    const triggerNode = fixture.nodes[0];
    if (!triggerNode || triggerNode.attributes.data.type !== "trigger") {
      throw new Error("Expected trigger node fixture");
    }

    const state = deserializeWorkflowGraph({
      ...fixture,
      nodes: [
        {
          ...triggerNode,
          attributes: {
            ...triggerNode.attributes,
            data: {
              ...triggerNode.attributes.data,
              config: {
                triggerType: "ClientJourney",
                event: "client.updated",
                correlationKey: "clientId",
                filter: {
                  logic: "and",
                  groups: [
                    {
                      logic: "and",
                      conditions: [
                        {
                          field: "client.firstName",
                          operator: "equals",
                          value: "Avery",
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      ],
    });

    const normalizedTriggerData = state.nodes[0]?.data as {
      config?: Record<string, unknown>;
    };

    expect(normalizedTriggerData.config).toEqual({
      triggerType: "ClientJourney",
      event: "client.created",
      correlationKey: "clientId",
      filter: {
        logic: "and",
        groups: [
          {
            logic: "and",
            conditions: [
              {
                field: "client.firstName",
                operator: "equals",
                value: "Avery",
              },
            ],
          },
        ],
      },
    });
  });

  test("switches active canvas graph to execution snapshot and back", () => {
    const store = createStore();
    const draft = deserializeWorkflowGraph(createGraphFixture());

    store.set(workflowEditorNodesAtom, draft.nodes);
    store.set(workflowEditorEdgesAtom, draft.edges);

    expect(
      store.get(workflowActiveCanvasNodesAtom).map((node) => node.id),
    ).toEqual(draft.nodes.map((node) => node.id));
    expect(
      store.get(workflowActiveCanvasEdgesAtom).map((edge) => edge.id),
    ).toEqual(draft.edges.map((edge) => edge.id));

    const executionSnapshot = deserializeWorkflowGraph({
      attributes: {},
      options: { type: "directed", allowSelfLoops: false, multi: false },
      nodes: [
        {
          key: "snapshot-trigger",
          attributes: {
            id: "snapshot-trigger",
            type: "trigger",
            position: { x: 0, y: 0 },
            data: {
              type: "trigger",
              label: "Trigger",
              config: {
                triggerType: "AppointmentJourney",
                start: "appointment.scheduled",
                restart: "appointment.rescheduled",
                stop: "appointment.canceled",
                correlationKey: "appointmentId",
              },
            },
          },
        },
      ],
      edges: [],
    });

    store.set(workflowExecutionViewGraphAtom, executionSnapshot);

    expect(
      store.get(workflowActiveCanvasNodesAtom).map((node) => node.id),
    ).toEqual(["snapshot-trigger"]);
    expect(store.get(workflowActiveCanvasEdgesAtom)).toEqual([]);

    store.set(workflowExecutionViewGraphAtom, null);

    expect(
      store.get(workflowActiveCanvasNodesAtom).map((node) => node.id),
    ).toEqual(draft.nodes.map((node) => node.id));
    expect(
      store.get(workflowActiveCanvasEdgesAtom).map((edge) => edge.id),
    ).toEqual(draft.edges.map((edge) => edge.id));
  });

  test("buildPersistableWorkflowGraph skips incomplete action nodes and keeps a valid linear graph", () => {
    const state = deserializeWorkflowGraph(createGraphFixture());
    const result = buildPersistableWorkflowGraph(state);

    expect(result.skippedNodeIds).toEqual(["action-node"]);
    expect(result.graph.nodes.map((node) => node.attributes.id)).toEqual([
      "trigger-node",
    ]);
    expect(result.graph.edges).toHaveLength(0);
    expect(linearJourneyGraphSchema.safeParse(result.graph).success).toBe(true);
  });

  test("buildPersistableWorkflowGraph also removes downstream nodes that lose their required incoming edge", () => {
    const state = deserializeWorkflowGraph(
      createGraphFixtureWithIncompleteMiddleAction(),
    );
    const result = buildPersistableWorkflowGraph(state);

    expect(new Set(result.skippedNodeIds)).toEqual(
      new Set(["incomplete-action", "downstream-action"]),
    );
    expect(result.graph.nodes.map((node) => node.attributes.id)).toEqual([
      "trigger-node",
    ]);
    expect(result.graph.edges).toHaveLength(0);
    expect(linearJourneyGraphSchema.safeParse(result.graph).success).toBe(true);
  });

  test("buildPersistableWorkflowGraph leaves valid action nodes intact", () => {
    const state = deserializeWorkflowGraph(createPersistableGraphFixture());
    const result = buildPersistableWorkflowGraph(state);

    expect(result.skippedNodeIds).toEqual([]);
    expect(result.graph.nodes.map((node) => node.attributes.id)).toEqual([
      "trigger-node",
      "action-node",
    ]);
    expect(result.graph.edges).toHaveLength(1);
    expect(linearJourneyGraphSchema.safeParse(result.graph).success).toBe(true);
  });

  test("buildPersistableWorkflowGraph skips condition steps with blank expressions", () => {
    const state = deserializeWorkflowGraph(
      createConditionMissingExpressionFixture(),
    );
    const result = buildPersistableWorkflowGraph(state);

    expect(result.skippedNodeIds).toEqual(["action-node"]);
    expect(result.graph.nodes.map((node) => node.attributes.id)).toEqual([
      "trigger-node",
    ]);
    expect(result.graph.edges).toHaveLength(0);
    expect(linearJourneyGraphSchema.safeParse(result.graph).success).toBe(true);
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
    expect(store.get(workflowEditorHasUnsavedChangesAtom)).toBe(false);
  });

  test("does not mark unsaved for node selection-only changes", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(onWorkflowEditorNodesChangeAtom, [
      {
        id: "action-node",
        type: "select",
        selected: true,
      },
    ]);

    expect(store.get(workflowEditorHasUnsavedChangesAtom)).toBe(false);
  });

  test("does not mark unsaved for edge selection-only changes", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(onWorkflowEditorEdgesChangeAtom, [
      {
        id: "edge-1",
        type: "select",
        selected: true,
      },
    ]);

    expect(store.get(workflowEditorHasUnsavedChangesAtom)).toBe(false);
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

  test("normalizes stale client trigger edge labels when graph loads", () => {
    const store = createStore();

    store.set(
      setWorkflowEditorGraphAtom,
      createStaleClientTriggerGraphFixture(),
    );

    const triggerEdges = store
      .get(workflowEditorEdgesAtom)
      .filter((edge) => edge.source === "trigger-node");

    expect(triggerEdges).toHaveLength(1);
    expect(triggerEdges[0]?.label).toBe("Created");
    expect(triggerEdges[0]?.sourceHandle).toBe("scheduled");
    expect(triggerEdges[0]?.data?.triggerBranch).toBe("scheduled");
  });

  test("updates trigger edge labels immediately when switching to client trigger", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(updateWorkflowEditorNodeDataAtom, {
      id: "trigger-node",
      data: {
        config: {
          triggerType: "ClientJourney",
          event: "client.created",
          correlationKey: "clientId",
        },
      },
    });

    let triggerEdge = store
      .get(workflowEditorEdgesAtom)
      .find((edge) => edge.source === "trigger-node");
    expect(triggerEdge?.label).toBe("Created");
    expect(triggerEdge?.sourceHandle).toBe("scheduled");
    expect(triggerEdge?.data?.triggerBranch).toBe("scheduled");

    store.set(updateWorkflowEditorNodeDataAtom, {
      id: "trigger-node",
      data: {
        config: {
          triggerType: "ClientJourney",
          event: "client.updated",
          correlationKey: "clientId",
          trackedAttributeKey: "client.email",
        },
      },
    });

    triggerEdge = store
      .get(workflowEditorEdgesAtom)
      .find((edge) => edge.source === "trigger-node");
    expect(triggerEdge?.label).toBe("Updated");
    expect(triggerEdge?.sourceHandle).toBe("scheduled");
    expect(triggerEdge?.data?.triggerBranch).toBe("scheduled");
  });

  test("collapses appointment trigger branches to a single client entry path", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixtureWithSecondAction());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(onWorkflowEditorConnectAtom, {
      source: "trigger-node",
      target: "action-node-2",
      sourceHandle: "canceled",
      targetHandle: null,
    });

    let triggerEdges = store
      .get(workflowEditorEdgesAtom)
      .filter((edge) => edge.source === "trigger-node");
    expect(triggerEdges).toHaveLength(2);

    store.set(updateWorkflowEditorNodeDataAtom, {
      id: "trigger-node",
      data: {
        config: {
          triggerType: "ClientJourney",
          event: "client.created",
          correlationKey: "clientId",
        },
      },
    });

    triggerEdges = store
      .get(workflowEditorEdgesAtom)
      .filter((edge) => edge.source === "trigger-node");
    expect(triggerEdges).toHaveLength(1);
    expect(triggerEdges[0]?.target).toBe("action-node");
    expect(triggerEdges[0]?.label).toBe("Created");
    expect(triggerEdges[0]?.sourceHandle).toBe("scheduled");
  });

  test("setWorkflowEditorSelectionAtom updates selected ids", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());

    store.set(setWorkflowEditorSelectionAtom, {
      nodeId: "action-node",
      edgeId: null,
    });

    expect(store.get(workflowEditorSelectedNodeIdAtom)).toBe("action-node");
    expect(store.get(workflowEditorSelectedEdgeIdAtom)).toBeNull();

    store.set(setWorkflowEditorSelectionAtom, {
      nodeId: null,
      edgeId: "edge-1",
    });

    expect(store.get(workflowEditorSelectedNodeIdAtom)).toBeNull();
    expect(store.get(workflowEditorSelectedEdgeIdAtom)).toBe("edge-1");
  });

  test("clearWorkflowEditorSelectionAtom clears selected ids and flags", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());

    store.set(workflowEditorNodesAtom, (nodes) =>
      nodes.map((node) =>
        node.id === "action-node" ? { ...node, selected: true } : node,
      ),
    );
    store.set(workflowEditorEdgesAtom, (edges) =>
      edges.map((edge) =>
        edge.id === "edge-1" ? { ...edge, selected: true } : edge,
      ),
    );
    store.set(setWorkflowEditorSelectionAtom, {
      nodeId: "action-node",
      edgeId: "edge-1",
    });
    store.set(clearWorkflowEditorSelectionAtom);

    expect(store.get(workflowEditorSelectedNodeIdAtom)).toBeNull();
    expect(store.get(workflowEditorSelectedEdgeIdAtom)).toBeNull();

    const anySelectedNode = store
      .get(workflowEditorNodesAtom)
      .some((node) => node.selected === true);
    const anySelectedEdge = store
      .get(workflowEditorEdgesAtom)
      .some((edge) => edge.selected === true);

    expect(anySelectedNode).toBe(false);
    expect(anySelectedEdge).toBe(false);
  });

  test("ignores unsupported action types", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(setWorkflowEditorActionTypeAtom, {
      nodeId: "action-node",
      actionType: "switch",
    });

    const nodes = store.get(workflowEditorNodesAtom);
    const actionNode = nodes.find((node) => node.id === "action-node");

    expect(actionNode?.data.config).toMatchObject({});
    expect(nodes.length).toBe(2);
    expect(store.get(workflowEditorHasUnsavedChangesAtom)).toBe(false);
  });

  test("ignores wait-for-confirmation for client triggers", () => {
    const store = createStore();
    store.set(
      setWorkflowEditorGraphAtom,
      createStaleClientTriggerGraphFixture(),
    );
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(setWorkflowEditorActionTypeAtom, {
      nodeId: "action-node",
      actionType: "wait-for-confirmation",
    });

    const nodes = store.get(workflowEditorNodesAtom);
    const actionNode = nodes.find((node) => node.id === "action-node");

    expect(actionNode?.data.config).toMatchObject({});
    expect(store.get(workflowEditorHasUnsavedChangesAtom)).toBe(false);
  });

  test("blocks wait action types on canceled trigger branch", () => {
    const store = createStore();
    store.set(
      setWorkflowEditorGraphAtom,
      createCanceledBranchActionGraphFixture(),
    );
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(setWorkflowEditorActionTypeAtom, {
      nodeId: "action-node",
      actionType: "wait",
    });
    store.set(setWorkflowEditorActionTypeAtom, {
      nodeId: "action-node",
      actionType: "wait-for-confirmation",
    });

    const actionNode = store
      .get(workflowEditorNodesAtom)
      .find((node) => node.id === "action-node");

    expect(actionNode?.data.config).toMatchObject({});
    expect(store.get(workflowEditorHasUnsavedChangesAtom)).toBe(false);
  });

  test("blocks wait action types on no-show trigger branch", () => {
    const store = createStore();
    store.set(
      setWorkflowEditorGraphAtom,
      createNoShowBranchActionGraphFixture(),
    );
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(setWorkflowEditorActionTypeAtom, {
      nodeId: "action-node",
      actionType: "wait",
    });
    store.set(setWorkflowEditorActionTypeAtom, {
      nodeId: "action-node",
      actionType: "wait-for-confirmation",
    });

    const actionNode = store
      .get(workflowEditorNodesAtom)
      .find((node) => node.id === "action-node");

    expect(actionNode?.data.config).toMatchObject({});
    expect(store.get(workflowEditorHasUnsavedChangesAtom)).toBe(false);
  });

  test("allows wait action types on scheduled trigger branch", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(setWorkflowEditorActionTypeAtom, {
      nodeId: "action-node",
      actionType: "wait",
    });

    let actionNode = store
      .get(workflowEditorNodesAtom)
      .find((node) => node.id === "action-node");

    expect(actionNode?.data.config).toMatchObject({ actionType: "wait" });

    store.set(setWorkflowEditorActionTypeAtom, {
      nodeId: "action-node",
      actionType: "wait-for-confirmation",
    });

    actionNode = store
      .get(workflowEditorNodesAtom)
      .find((node) => node.id === "action-node");

    expect(actionNode?.data.config).toMatchObject({
      actionType: "wait-for-confirmation",
    });
  });

  test("sets a service default label when selecting an action from a generic label", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(setWorkflowEditorActionTypeAtom, {
      nodeId: "action-node",
      actionType: "send-slack",
    });

    const actionNode = store
      .get(workflowEditorNodesAtom)
      .find((node) => node.id === "action-node");

    expect(actionNode?.data.label).toBe("Slack");
    expect(actionNode?.data.config).toMatchObject({
      actionType: "send-slack",
    });
  });

  test("preserves custom labels when selecting a different action type", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(updateWorkflowEditorNodeDataAtom, {
      id: "action-node",
      data: { label: "Post-booking follow-up" },
    });
    store.set(setWorkflowEditorActionTypeAtom, {
      nodeId: "action-node",
      actionType: "send-resend",
    });

    const actionNode = store
      .get(workflowEditorNodesAtom)
      .find((node) => node.id === "action-node");

    expect(actionNode?.data.label).toBe("Post-booking follow-up");
    expect(actionNode?.data.config).toMatchObject({
      actionType: "send-resend",
    });
  });

  test("replaces default action labels when action type changes", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(updateWorkflowEditorNodeDataAtom, {
      id: "action-node",
      data: {
        label: "Slack",
        config: { actionType: "send-slack" },
      },
    });
    store.set(setWorkflowEditorActionTypeAtom, {
      nodeId: "action-node",
      actionType: "send-resend",
    });

    const actionNode = store
      .get(workflowEditorNodesAtom)
      .find((node) => node.id === "action-node");

    expect(actionNode?.data.label).toBe("Resend");
    expect(actionNode?.data.config).toMatchObject({
      actionType: "send-resend",
    });
  });

  test("allows multiple outgoing edges from a source step", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixtureWithSecondAction());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(onWorkflowEditorConnectAtom, {
      source: "trigger-node",
      target: "action-node-2",
      sourceHandle: null,
      targetHandle: null,
    });

    const edges = store.get(workflowEditorEdgesAtom);
    const outgoingFromTrigger = edges.filter(
      (edge) => edge.source === "trigger-node",
    );

    expect(outgoingFromTrigger).toHaveLength(2);
    expect(
      outgoingFromTrigger.some((edge) => edge.target === "action-node"),
    ).toBeTrue();
    expect(
      outgoingFromTrigger.some((edge) => edge.target === "action-node-2"),
    ).toBeTrue();
  });

  test("auto-assigns no-show branch for the third trigger edge", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixtureWithSecondAction());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(onWorkflowEditorConnectAtom, {
      source: "trigger-node",
      target: "action-node-2",
      sourceHandle: "canceled",
      targetHandle: null,
    });

    store.set(addWorkflowEditorNodeAtom, {
      id: "action-node-3",
      type: "action",
      position: { x: 760, y: 140 },
      data: {
        type: "action",
        label: "Action 3",
        status: "idle",
        config: {},
      },
    });

    store.set(onWorkflowEditorConnectAtom, {
      source: "trigger-node",
      target: "action-node-3",
      sourceHandle: null,
      targetHandle: null,
    });

    const edge = store
      .get(workflowEditorEdgesAtom)
      .find(
        (currentEdge) =>
          currentEdge.source === "trigger-node" &&
          currentEdge.target === "action-node-3",
      );

    expect(edge?.sourceHandle).toBe("no_show");
    expect(edge?.label).toBe("No Show");
    expect(edge?.data?.triggerBranch).toBe("no_show");
  });

  test("keeps a single incoming edge to a target step", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixtureWithSecondAction());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(onWorkflowEditorConnectAtom, {
      source: "action-node-2",
      target: "action-node",
      sourceHandle: null,
      targetHandle: null,
    });

    const edges = store.get(workflowEditorEdgesAtom);
    const incomingToAction = edges.filter(
      (edge) => edge.target === "action-node",
    );

    expect(incomingToAction).toHaveLength(1);
    expect(incomingToAction[0]?.source).toBe("action-node-2");
  });

  test("allows multiple outgoing edges on the same condition branch", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createConditionGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(onWorkflowEditorConnectAtom, {
      source: "condition-node",
      target: "action-node-b",
      sourceHandle: "false",
      targetHandle: null,
    });

    let edges = store.get(workflowEditorEdgesAtom);
    const outgoingAfterAdd = edges.filter(
      (edge) => edge.source === "condition-node",
    );
    expect(outgoingAfterAdd).toHaveLength(2);
    expect(
      outgoingAfterAdd.some((edge) => edge.sourceHandle === "true"),
    ).toBeTrue();
    expect(
      outgoingAfterAdd.some((edge) => edge.sourceHandle === "false"),
    ).toBeTrue();

    store.set(onWorkflowEditorConnectAtom, {
      source: "condition-node",
      target: "action-node-c",
      sourceHandle: "false",
      targetHandle: null,
    });

    edges = store.get(workflowEditorEdgesAtom);
    const outgoingAfterSecondFalseBranch = edges.filter(
      (edge) => edge.source === "condition-node",
    );
    expect(outgoingAfterSecondFalseBranch).toHaveLength(3);
    expect(
      outgoingAfterSecondFalseBranch.filter(
        (edge) => edge.sourceHandle === "true",
      ),
    ).toHaveLength(1);
    expect(
      outgoingAfterSecondFalseBranch.filter(
        (edge) => edge.sourceHandle === "false",
      ),
    ).toHaveLength(2);
  });

  test("adds node via addWorkflowEditorNodeAtom and updates selection", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(addWorkflowEditorNodeAtom, {
      id: "new-action",
      type: "action",
      position: { x: 640, y: 180 },
      data: {
        type: "action",
        label: "Action",
        status: "idle",
        config: {},
      },
    });

    const nodes = store.get(workflowEditorNodesAtom);
    expect(nodes.some((node) => node.id === "new-action")).toBe(true);
    expect(store.get(workflowEditorSelectedNodeIdAtom)).toBe("new-action");
    expect(store.get(workflowEditorSelectedEdgeIdAtom)).toBe(null);
    expect(store.get(workflowEditorHasUnsavedChangesAtom)).toBe(true);
  });

  test("deletes an edge when requested", () => {
    const store = createStore();
    store.set(setWorkflowEditorGraphAtom, createGraphFixture());
    store.set(workflowEditorIsReadOnlyAtom, false);

    store.set(deleteEdgeAtom, "edge-1");

    expect(store.get(workflowEditorEdgesAtom)).toHaveLength(0);
  });
});
