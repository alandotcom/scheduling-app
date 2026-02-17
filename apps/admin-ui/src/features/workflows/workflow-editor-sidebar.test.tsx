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

function renderSidebar({
  canManageWorkflow,
  onSetActionType,
  selectedNode = createNodeFixture(),
}: {
  canManageWorkflow: boolean;
  onSetActionType?: (input: { nodeId: string; actionType: string }) => void;
  selectedNode?: Node;
}) {
  const queryClient = createTestQueryClient();
  const onUpdateNodeData = mock(() => {});

  render(
    <QueryClientProvider client={queryClient}>
      <WorkflowEditorSidebar
        canManageWorkflow={canManageWorkflow}
        onSetActionType={onSetActionType}
        onUpdateNodeData={onUpdateNodeData}
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
          canManageWorkflow={true}
          onUpdateNodeData={onUpdateNodeData}
          selectedNode={firstNode}
          workflowId={null}
        />
      </QueryClientProvider>,
    );

    const labelInput = screen.getByLabelText("Label") as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: "Unsaved A" } });
    expect(labelInput.value).toBe("Unsaved A");

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <WorkflowEditorSidebar
          canManageWorkflow={true}
          onUpdateNodeData={onUpdateNodeData}
          selectedNode={secondNode}
          workflowId={null}
        />
      </QueryClientProvider>,
    );

    const switchedLabelInput = screen.getByLabelText(
      "Label",
    ) as HTMLInputElement;
    expect(switchedLabelInput.value).toBe("Trigger B");

    fireEvent.change(switchedLabelInput, { target: { value: "Edited B" } });
    fireEvent.blur(switchedLabelInput);

    expect(onUpdateNodeData).toHaveBeenCalledWith({
      id: "trigger-b",
      data: { label: "Edited B" },
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

  test("shows only journey v1 step types for unconfigured actions", () => {
    renderSidebar({
      canManageWorkflow: true,
      selectedNode: createUnconfiguredActionNodeFixture(),
    });

    expect(screen.getByPlaceholderText("Search actions...")).toBeTruthy();
    expect(screen.getByTestId("action-group-toggle-system")).toBeTruthy();
    expect(screen.getByTestId("action-group-toggle-resend")).toBeTruthy();
    expect(screen.getByTestId("action-group-toggle-slack")).toBeTruthy();
    expect(screen.getByText("Wait")).toBeTruthy();
    expect(screen.getByText("Send Email")).toBeTruthy();
    expect(screen.getByText("Send Email Template")).toBeTruthy();
    expect(screen.getByText("Send Channel Message")).toBeTruthy();
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
});
