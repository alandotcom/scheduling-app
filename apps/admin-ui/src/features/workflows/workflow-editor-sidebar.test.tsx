import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Edge, Node } from "@xyflow/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "@/test-utils/render";
import {
  buildUpstreamOutputSuggestions,
  WorkflowEditorSidebar,
} from "./workflow-editor-sidebar";

afterEach(() => {
  cleanup();
});

function createNodeFixture(): Node {
  return {
    id: "trigger-node",
    position: { x: 0, y: 0 },
    data: {
      type: "trigger",
      label: "Trigger",
      description: "Trigger node",
      config: {
        triggerType: "AppointmentJourney",
        start: "appointment.scheduled",
        restart: "appointment.rescheduled",
        stop: "appointment.canceled",
        correlationKey: "appointmentId",
      },
    },
  };
}

function createNodeFixtureWithId(id: string, label: string): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      type: "trigger",
      label,
      description: `${label} description`,
      config: {
        triggerType: "AppointmentJourney",
        start: "appointment.scheduled",
        restart: "appointment.rescheduled",
        stop: "appointment.canceled",
        correlationKey: "appointmentId",
      },
    },
  };
}

function createActionNodeFixture(input: {
  id: string;
  label: string;
  actionType: string;
  outputAttributes?: string;
}): Node {
  return {
    id: input.id,
    position: { x: 0, y: 0 },
    data: {
      type: "action",
      label: input.label,
      description: `${input.label} description`,
      config: {
        actionType: input.actionType,
        ...(input.outputAttributes
          ? { outputAttributes: input.outputAttributes }
          : {}),
      },
    },
  };
}

function createUnconfiguredActionNodeFixture(): Node {
  return {
    id: "action-node",
    position: { x: 0, y: 0 },
    data: {
      type: "action",
      label: "Action",
      description: "",
      config: {},
    },
  };
}

function createClientTriggerNodeFixture(): Node {
  return {
    id: "trigger-node",
    position: { x: 0, y: 0 },
    data: {
      type: "trigger",
      label: "Client Trigger",
      description: "Client trigger node",
      config: {
        triggerType: "ClientJourney",
        event: "client.created",
        correlationKey: "clientId",
      },
    },
  };
}

function renderSidebar({
  canManageWorkflow,
  isTriggerTypeLocked = false,
  onSetActionType,
  selectedNode = createNodeFixture(),
  nodes = [],
  edges = [],
}: {
  canManageWorkflow: boolean;
  isTriggerTypeLocked?: boolean;
  onSetActionType?: (input: { nodeId: string; actionType: string }) => void;
  selectedNode?: Node;
  nodes?: Node[];
  edges?: Edge[];
}) {
  const queryClient = createTestQueryClient();
  const onUpdateNodeData = mock(() => {});

  render(
    <QueryClientProvider client={queryClient}>
      <WorkflowEditorSidebar
        activeTab="properties"
        canManageWorkflow={canManageWorkflow}
        defaultTimezone="America/New_York"
        edges={edges}
        isTriggerTypeLocked={isTriggerTypeLocked}
        nodes={nodes}
        onActiveTabChange={() => {}}
        onSelectedRunIdChange={() => {}}
        onSetActionType={onSetActionType}
        onUpdateNodeData={onUpdateNodeData}
        selectedRunId={null}
        selectedNode={selectedNode}
        workflowId={null}
      />
    </QueryClientProvider>,
  );

  return { onUpdateNodeData };
}

describe("WorkflowEditorSidebar role behavior", () => {
  test("disables config inputs in read-only mode", () => {
    renderSidebar({ canManageWorkflow: false });

    const labelInput = screen.getByLabelText("Label") as HTMLInputElement;

    expect(labelInput.disabled).toBe(true);
    expect(
      screen.getByText(
        "Read-only mode: members can inspect workflow configuration and runs, but cannot mutate settings.",
      ),
    ).toBeTruthy();
  });

  test("keeps config inputs enabled for admins", () => {
    renderSidebar({ canManageWorkflow: true });

    const labelInput = screen.getByLabelText("Label") as HTMLInputElement;

    expect(labelInput.disabled).toBe(false);
    expect(
      screen.getByRole("button", { name: "Toggle audience rules" }),
    ).toBeTruthy();
  });

  test("re-syncs selected node inputs when switching nodes", () => {
    const queryClient = createTestQueryClient();
    const onUpdateNodeData = mock(() => {});
    const firstNode = createNodeFixtureWithId("trigger-a", "Trigger A");
    const secondNode = createNodeFixtureWithId("trigger-b", "Trigger B");

    const view = render(
      <QueryClientProvider client={queryClient}>
        <WorkflowEditorSidebar
          activeTab="properties"
          canManageWorkflow={true}
          defaultTimezone="America/New_York"
          onActiveTabChange={() => {}}
          onSelectedRunIdChange={() => {}}
          onUpdateNodeData={onUpdateNodeData}
          selectedRunId={null}
          selectedNode={firstNode}
          workflowId={null}
        />
      </QueryClientProvider>,
    );

    const labelInput = screen.getByLabelText("Label") as HTMLInputElement;
    fireEvent.input(labelInput, { target: { value: "Unsaved A" } });
    expect(onUpdateNodeData).toHaveBeenCalledWith({
      id: "trigger-a",
      data: { label: "Unsaved A" },
    });

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <WorkflowEditorSidebar
          activeTab="properties"
          canManageWorkflow={true}
          defaultTimezone="America/New_York"
          onActiveTabChange={() => {}}
          onSelectedRunIdChange={() => {}}
          onUpdateNodeData={onUpdateNodeData}
          selectedRunId={null}
          selectedNode={secondNode}
          workflowId={null}
        />
      </QueryClientProvider>,
    );

    const switchedLabelInput = screen.getByLabelText(
      "Label",
    ) as HTMLInputElement;
    expect(switchedLabelInput.value).toBe("Trigger B");

    fireEvent.input(switchedLabelInput, { target: { value: "Edited B" } });

    expect(onUpdateNodeData).toHaveBeenCalledWith({
      id: "trigger-b",
      data: { label: "Edited B" },
    });
  });

  test("clearing description writes undefined immediately", () => {
    const { onUpdateNodeData } = renderSidebar({ canManageWorkflow: true });

    const descriptionInput = screen.getByLabelText(
      "Description",
    ) as HTMLInputElement;
    fireEvent.input(descriptionInput, { target: { value: "   " } });

    expect(onUpdateNodeData).toHaveBeenCalledWith({
      id: "trigger-node",
      data: { description: undefined },
    });
  });

  test("updates label on each change event", () => {
    const { onUpdateNodeData } = renderSidebar({ canManageWorkflow: true });
    const labelInput = screen.getByLabelText("Label") as HTMLInputElement;

    fireEvent.input(labelInput, { target: { value: "A" } });
    fireEvent.input(labelInput, { target: { value: "AB" } });

    expect(onUpdateNodeData).toHaveBeenNthCalledWith(1, {
      id: "trigger-node",
      data: { label: "A" },
    });
    expect(onUpdateNodeData).toHaveBeenNthCalledWith(2, {
      id: "trigger-node",
      data: { label: "AB" },
    });
  });

  test("does not expose logger output attributes in upstream suggestions", () => {
    const triggerNode = createNodeFixture();
    const upstreamAction = createActionNodeFixture({
      id: "action-upstream",
      label: "Action1",
      actionType: "logger",
      outputAttributes: "createdAt, requestId",
    });
    const selectedAction = createActionNodeFixture({
      id: "action-selected",
      label: "Logger step",
      actionType: "logger",
    });
    const unrelatedAction = createActionNodeFixture({
      id: "action-unrelated",
      label: "Action3",
      actionType: "logger",
      outputAttributes: "secret",
    });

    const edges: Edge[] = [
      {
        id: "edge-trigger-upstream",
        source: triggerNode.id,
        target: upstreamAction.id,
      },
      {
        id: "edge-upstream-selected",
        source: upstreamAction.id,
        target: selectedAction.id,
      },
    ];

    const suggestions = buildUpstreamOutputSuggestions({
      selectedNodeId: selectedAction.id,
      nodes: [triggerNode, upstreamAction, selectedAction, unrelatedAction],
      edges,
    });

    expect(
      suggestions.some(
        (suggestion) => suggestion.value === "Action1.createdAt",
      ),
    ).toBeFalse();
    expect(
      suggestions.some((suggestion) => suggestion.value === "Action3.secret"),
    ).toBeFalse();
  });

  test("builds human-readable labels for upstream output suggestions", () => {
    const triggerNode = createNodeFixture();
    const upstreamAction = createActionNodeFixture({
      id: "action-upstream",
      label: "Action1",
      actionType: "wait",
      outputAttributes: "createdAt",
    });
    const selectedAction = createActionNodeFixture({
      id: "action-selected",
      label: "Action2",
      actionType: "send-resend",
    });
    const edges: Edge[] = [
      {
        id: "edge-trigger-upstream",
        source: triggerNode.id,
        target: upstreamAction.id,
      },
      {
        id: "edge-upstream-selected",
        source: upstreamAction.id,
        target: selectedAction.id,
      },
    ];

    const suggestions = buildUpstreamOutputSuggestions({
      selectedNodeId: selectedAction.id,
      nodes: [triggerNode, upstreamAction, selectedAction],
      edges,
    });
    const createdAtSuggestion = suggestions.find(
      (suggestion) => suggestion.value === "Action1.createdAt",
    );

    expect(createdAtSuggestion).toBeDefined();
    expect(createdAtSuggestion?.label).toBe("Action1 Created At");
  });

  test("shows only journey v1 step types for unconfigured actions", () => {
    renderSidebar({
      canManageWorkflow: true,
      selectedNode: createUnconfiguredActionNodeFixture(),
    });

    expect(screen.getByPlaceholderText("Search actions...")).toBeTruthy();
    expect(screen.getByTestId("action-group-toggle-system")).toBeTruthy();
    expect(screen.getByTestId("action-group-toggle-resend")).toBeTruthy();
    expect(screen.getByTestId("action-group-toggle-slack")).toBeTruthy();
    expect(screen.getByTestId("action-group-toggle-twilio")).toBeTruthy();
    expect(screen.getByText("Wait")).toBeTruthy();
    expect(screen.getByText("Send Email")).toBeTruthy();
    expect(screen.getByText("Send Email Template")).toBeTruthy();
    expect(screen.getByText("Send Channel Message")).toBeTruthy();
    expect(screen.getByText("Send SMS")).toBeTruthy();
    expect(screen.getByText("Logger")).toBeTruthy();
    expect(screen.queryByText("HTTP Request")).toBeNull();
    expect(screen.getByText("Condition")).toBeTruthy();
    expect(screen.queryByText("Switch")).toBeNull();
  });

  test("selecting an action calls onSetActionType", () => {
    const onSetActionType = mock(
      (_input: { nodeId: string; actionType: string }) => {},
    );

    renderSidebar({
      canManageWorkflow: true,
      onSetActionType,
      selectedNode: createUnconfiguredActionNodeFixture(),
    });

    fireEvent.click(screen.getByTestId("action-option-send-resend"));

    expect(onSetActionType).toHaveBeenCalledWith({
      nodeId: "action-node",
      actionType: "send-resend",
    });
  });

  test("hides wait-for-confirmation for client triggers in unconfigured action picker", () => {
    const clientTriggerNode = createClientTriggerNodeFixture();
    const unconfiguredActionNode = createUnconfiguredActionNodeFixture();

    renderSidebar({
      canManageWorkflow: true,
      selectedNode: unconfiguredActionNode,
      nodes: [clientTriggerNode, unconfiguredActionNode],
    });

    expect(screen.queryByText("Wait For Confirmation")).toBeNull();
  });

  test("hides wait actions on canceled trigger branch in unconfigured action picker", () => {
    const triggerNode = createNodeFixture();
    const unconfiguredActionNode = createUnconfiguredActionNodeFixture();
    const canceledEdge: Edge = {
      id: "edge-canceled",
      source: triggerNode.id,
      target: unconfiguredActionNode.id,
      sourceHandle: "canceled",
      label: "Canceled",
      data: { triggerBranch: "canceled" },
    };

    renderSidebar({
      canManageWorkflow: true,
      selectedNode: unconfiguredActionNode,
      nodes: [triggerNode, unconfiguredActionNode],
      edges: [canceledEdge],
    });

    expect(screen.queryByText("Wait")).toBeNull();
    expect(screen.queryByText("Wait For Confirmation")).toBeNull();
  });

  test("hides wait actions on no-show trigger branch in unconfigured action picker", () => {
    const triggerNode = createNodeFixture();
    const unconfiguredActionNode = createUnconfiguredActionNodeFixture();
    const noShowEdge: Edge = {
      id: "edge-no-show",
      source: triggerNode.id,
      target: unconfiguredActionNode.id,
      sourceHandle: "no_show",
      label: "No Show",
      data: { triggerBranch: "no_show" },
    };

    renderSidebar({
      canManageWorkflow: true,
      selectedNode: unconfiguredActionNode,
      nodes: [triggerNode, unconfiguredActionNode],
      edges: [noShowEdge],
    });

    expect(screen.queryByText("Wait")).toBeNull();
    expect(screen.queryByText("Wait For Confirmation")).toBeNull();
  });

  test("does not allow changing trigger type when trigger type is locked", () => {
    const { onUpdateNodeData } = renderSidebar({
      canManageWorkflow: true,
      isTriggerTypeLocked: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "Client" }));

    expect(onUpdateNodeData).toHaveBeenCalledTimes(0);
    expect(
      screen.getByText(
        "Trigger type is locked once the workflow includes additional steps.",
      ),
    ).toBeTruthy();
  });
});
