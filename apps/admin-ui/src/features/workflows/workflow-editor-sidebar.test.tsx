import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Node } from "@xyflow/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "@/test-utils/render";
import { WorkflowEditorSidebar } from "./workflow-editor-sidebar";

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
        triggerType: "DomainEvent",
        startEvents: ["appointment.created"],
        restartEvents: [],
        stopEvents: [],
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
        triggerType: "DomainEvent",
        startEvents: ["appointment.created"],
        restartEvents: [],
        stopEvents: [],
      },
    },
  };
}

function renderSidebar(canManageWorkflow: boolean) {
  const queryClient = createTestQueryClient();
  const onUpdateNodeData = mock(() => {});

  render(
    <QueryClientProvider client={queryClient}>
      <WorkflowEditorSidebar
        canManageWorkflow={canManageWorkflow}
        onUpdateNodeData={onUpdateNodeData}
        selectedNode={createNodeFixture()}
        workflowId={null}
      />
    </QueryClientProvider>,
  );

  return { onUpdateNodeData };
}

describe("WorkflowEditorSidebar role behavior", () => {
  test("disables config inputs in read-only mode", () => {
    renderSidebar(false);

    const labelInput = screen.getByLabelText("Label") as HTMLInputElement;
    const startEventsInput = screen.getByLabelText(
      "Start events",
    ) as HTMLTextAreaElement;

    expect(labelInput.disabled).toBe(true);
    expect(startEventsInput.disabled).toBe(true);
    expect(
      screen.getByText(
        "Read-only mode: members can inspect workflow configuration and runs, but cannot mutate settings.",
      ),
    ).toBeTruthy();
  });

  test("keeps config inputs enabled for admins", () => {
    renderSidebar(true);

    const labelInput = screen.getByLabelText("Label") as HTMLInputElement;
    const startEventsInput = screen.getByLabelText(
      "Start events",
    ) as HTMLTextAreaElement;

    expect(labelInput.disabled).toBe(false);
    expect(startEventsInput.disabled).toBe(false);
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
});
