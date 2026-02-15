import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { useState } from "react";
import {
  WorkflowEditorContextMenu,
  type ContextMenuState,
} from "./workflow-editor-context-menu";
import {
  workflowEditorEdgesAtom,
  workflowEditorNodesAtom,
  type WorkflowCanvasEdge,
  type WorkflowCanvasNode,
} from "./workflow-editor-store";

afterEach(() => {
  cleanup();
});

function renderWithStore(
  menuState: ContextMenuState,
  nodes: WorkflowCanvasNode[] = [],
  edges: WorkflowCanvasEdge[] = [],
) {
  const store = createStore();
  store.set(workflowEditorNodesAtom, nodes);
  store.set(workflowEditorEdgesAtom, edges);

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

  test("disables delete for switch edges", () => {
    renderWithStore(
      {
        type: "edge",
        position: { x: 90, y: 70 },
        edgeId: "switch-edge",
      },
      [
        {
          id: "switch-node",
          type: "action",
          position: { x: 0, y: 0 },
          data: {
            type: "action",
            label: "Switch",
            status: "idle",
            config: { actionType: "switch" },
          },
        },
        {
          id: "child-node",
          type: "action",
          position: { x: 300, y: 0 },
          data: {
            type: "action",
            label: "Branch",
            status: "idle",
            config: {},
          },
        },
      ],
      [
        {
          id: "switch-edge",
          source: "switch-node",
          target: "child-node",
          data: { switchBranch: "created" },
        },
      ],
    );

    const button = screen.getByRole("button", { name: "Delete edge" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  test("disables delete for switch branch child node", () => {
    renderWithStore(
      {
        type: "node",
        position: { x: 90, y: 70 },
        nodeId: "created-branch-node",
      },
      [
        {
          id: "switch-node",
          type: "action",
          position: { x: 0, y: 0 },
          data: {
            type: "action",
            label: "Switch",
            status: "idle",
            config: { actionType: "switch" },
          },
        },
        {
          id: "created-branch-node",
          type: "action",
          position: { x: 300, y: 0 },
          data: {
            type: "action",
            label: "Created path",
            status: "idle",
            config: {},
          },
        },
      ],
      [
        {
          id: "switch-created-edge",
          source: "switch-node",
          target: "created-branch-node",
          data: { switchBranch: "created" },
        },
      ],
    );

    const button = screen.getByRole("button", { name: "Delete Created path" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  test("keeps delete confirmation dialog open after context menu closes", () => {
    const store = createStore();
    store.set(workflowEditorNodesAtom, [
      {
        id: "action-1",
        type: "action",
        position: { x: 0, y: 0 },
        data: { type: "action", label: "Action", status: "idle", config: {} },
      },
    ]);

    function Harness() {
      const [menuState, setMenuState] = useState<ContextMenuState>({
        type: "node",
        position: { x: 90, y: 70 },
        nodeId: "action-1",
      });

      return (
        <Provider store={store}>
          <WorkflowEditorContextMenu
            menuState={menuState}
            onClose={() => setMenuState(null)}
          />
        </Provider>
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Action" }));

    expect(screen.queryByRole("button", { name: "Delete Action" })).toBeNull();
    expect(screen.getByText("Delete action node")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(store.get(workflowEditorNodesAtom)).toHaveLength(0);
  });
});
