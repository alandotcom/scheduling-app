import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
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
});
