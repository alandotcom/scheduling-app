import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import {
  WorkflowEditorContextMenu,
  type ContextMenuState,
} from "./workflow-editor-context-menu";
import {
  workflowEditorNodesAtom,
  type WorkflowCanvasNode,
} from "./workflow-editor-store";

afterEach(() => {
  cleanup();
});

function renderWithStore(
  menuState: ContextMenuState,
  nodes: WorkflowCanvasNode[] = [],
) {
  const store = createStore();
  store.set(workflowEditorNodesAtom, nodes);

  const onClose = mock(() => {});

  render(
    <Provider store={store}>
      <WorkflowEditorContextMenu menuState={menuState} onClose={onClose} />
    </Provider>,
  );

  return { onClose };
}

describe("workflow-editor-context-menu", () => {
  test("shows add action on pane context menu when graph has real nodes", () => {
    renderWithStore(
      {
        type: "pane",
        position: { x: 100, y: 80 },
        flowPosition: { x: 200, y: 120 },
      },
      [
        {
          id: "action-1",
          type: "action",
          position: { x: 10, y: 20 },
          data: { type: "action", label: "Action", status: "idle", config: {} },
        },
      ],
    );

    expect(screen.getByRole("button", { name: "Add action" })).toBeTruthy();
  });

  test("shows add trigger on pane context menu when graph is empty", () => {
    renderWithStore({
      type: "pane",
      position: { x: 100, y: 80 },
      flowPosition: { x: 200, y: 120 },
    });

    expect(screen.getByRole("button", { name: "Add trigger" })).toBeTruthy();
  });

  test("disables delete for trigger node", () => {
    renderWithStore(
      {
        type: "node",
        position: { x: 90, y: 70 },
        nodeId: "trigger-node",
      },
      [
        {
          id: "trigger-node",
          type: "trigger",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger",
            label: "Trigger",
            status: "idle",
            config: {},
          },
        },
      ],
    );

    const button = screen.getByRole("button", { name: "Delete Trigger" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  test("shows node delete label using node label", () => {
    renderWithStore(
      {
        type: "node",
        position: { x: 90, y: 70 },
        nodeId: "action-send-email",
      },
      [
        {
          id: "action-send-email",
          type: "action",
          position: { x: 0, y: 0 },
          data: {
            type: "action",
            label: "Send Email",
            status: "idle",
            config: {},
          },
        },
      ],
    );

    expect(
      screen.getByRole("button", { name: "Delete Send Email" }),
    ).toBeTruthy();
  });
});
