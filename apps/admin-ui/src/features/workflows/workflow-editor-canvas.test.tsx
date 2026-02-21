import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";

type CapturedCanvasProps = {
  onNodeClick?: (event: MouseEvent, node: { id: string }) => void;
  onPaneClick?: () => void;
  onSelectionChange?: (input: {
    nodes: Array<{ id: string }>;
    edges: Array<{ id: string }>;
  }) => void;
};

let capturedCanvasProps: CapturedCanvasProps | null = null;

function getCapturedCanvasProps(): CapturedCanvasProps {
  if (!capturedCanvasProps) {
    throw new Error("Canvas props were not captured");
  }

  return capturedCanvasProps;
}

mock.module("@xyflow/react", () => ({
  ConnectionMode: {
    Strict: "strict",
  },
  Position: {
    Top: "top",
    Bottom: "bottom",
    Left: "left",
    Right: "right",
  },
  useReactFlow: () => ({
    fitView: async () => undefined,
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
    setViewport: async () => undefined,
    zoomIn: () => undefined,
    zoomOut: () => undefined,
  }),
  applyNodeChanges: (
    _changes: unknown[],
    nodes: Array<Record<string, unknown>>,
  ) => nodes,
  applyEdgeChanges: (
    _changes: unknown[],
    edges: Array<Record<string, unknown>>,
  ) => edges,
  addEdge: (
    edge: Record<string, unknown>,
    edges: Array<Record<string, unknown>>,
  ) => [...edges, edge],
  reconnectEdge: (
    oldEdge: Record<string, unknown>,
    connection: Record<string, unknown>,
    edges: Array<Record<string, unknown>>,
  ) =>
    edges.map((edge) =>
      edge.id === oldEdge.id
        ? {
            ...edge,
            ...connection,
          }
        : edge,
    ),
  Panel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Handle: () => null,
  Background: () => null,
  BackgroundVariant: {
    Dots: "dots",
  },
  BaseEdge: () => null,
  getSmoothStepPath: () => ["", 0, 0, 0, 0],
  useInternalNode: () => null,
  useUpdateNodeInternals: () => () => undefined,
}));

mock.module("@/components/flow-elements/canvas", () => ({
  Canvas: ({
    children,
    ...props
  }: {
    children?: ReactNode;
    [key: string]: unknown;
  }) => {
    capturedCanvasProps = props as CapturedCanvasProps;
    return <div>{children}</div>;
  },
}));

mock.module("@/components/flow-elements/connection", () => ({
  Connection: () => null,
}));

mock.module("@/components/flow-elements/edge", () => ({
  Edge: {
    Animated: () => null,
    Temporary: () => null,
  },
}));

mock.module("@/components/flow-elements/panel", () => ({
  Panel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

mock.module("./workflow-editor-context-menu", () => ({
  WorkflowEditorContextMenu: () => null,
  useWorkflowEditorContextMenuHandlers: () => ({
    onNodeContextMenu: () => undefined,
    onEdgeContextMenu: () => undefined,
    onPaneContextMenu: () => undefined,
  }),
}));

const { WorkflowEditorCanvas } = await import("./workflow-editor-canvas");
const {
  setWorkflowEditorSelectionAtom,
  workflowEditorEdgesAtom,
  workflowEditorIsLoadedAtom,
  workflowEditorNodesAtom,
  workflowEditorSelectedEdgeIdAtom,
  workflowEditorSelectedNodeIdAtom,
} = await import("./workflow-editor-store");

function createNode(input: { id: string; type: "trigger" | "action" }) {
  return {
    id: input.id,
    type: input.type,
    position: { x: 0, y: 0 },
    data:
      input.type === "trigger"
        ? {
            type: "trigger",
            label: "Trigger",
            config: {
              triggerType: "AppointmentJourney",
              start: "appointment.scheduled",
              restart: "appointment.rescheduled",
              stop: "appointment.canceled",
              correlationKey: "appointmentId",
            },
          }
        : {
            type: "action",
            label: "Action",
            config: {},
          },
  };
}

function renderCanvas(input?: {
  nodes?: Array<ReturnType<typeof createNode>>;
  edges?: Array<{ id: string; source: string; target: string }>;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  isLoaded?: boolean;
  canEdit?: boolean;
}) {
  capturedCanvasProps = null;

  const store = createStore();
  store.set(workflowEditorNodesAtom, input?.nodes ?? []);
  store.set(workflowEditorEdgesAtom, input?.edges ?? []);
  store.set(workflowEditorIsLoadedAtom, input?.isLoaded ?? false);
  store.set(setWorkflowEditorSelectionAtom, {
    nodeId: input?.selectedNodeId ?? null,
    edgeId: input?.selectedEdgeId ?? null,
  });

  render(
    <Provider store={store}>
      <WorkflowEditorCanvas canEdit={input?.canEdit ?? true} />
    </Provider>,
  );

  return {
    store,
    canvasProps: getCapturedCanvasProps(),
  };
}

afterEach(() => {
  cleanup();
  capturedCanvasProps = null;
});

describe("workflow-editor-canvas selection sync", () => {
  test("switches selected node from React Flow selection change", () => {
    const first = createNode({ id: "node-a", type: "trigger" });
    const second = createNode({ id: "node-b", type: "action" });
    const { store, canvasProps } = renderCanvas({
      nodes: [first, second],
      selectedNodeId: "node-a",
    });

    act(() => {
      canvasProps.onNodeClick?.({} as MouseEvent, { id: "node-b" });
    });

    expect(store.get(workflowEditorSelectedNodeIdAtom)).toBe("node-a");

    act(() => {
      canvasProps.onSelectionChange?.({
        nodes: [{ id: "node-b" }],
        edges: [],
      });
    });

    expect(store.get(workflowEditorSelectedNodeIdAtom)).toBe("node-b");
    expect(store.get(workflowEditorSelectedEdgeIdAtom)).toBeNull();
  });

  test("selects edge and clears selected node", () => {
    const first = createNode({ id: "node-a", type: "trigger" });
    const second = createNode({ id: "node-b", type: "action" });
    const { store, canvasProps } = renderCanvas({
      nodes: [first, second],
      edges: [{ id: "edge-1", source: "node-a", target: "node-b" }],
      selectedNodeId: "node-b",
    });

    act(() => {
      canvasProps.onSelectionChange?.({
        nodes: [],
        edges: [{ id: "edge-1" }],
      });
    });

    expect(store.get(workflowEditorSelectedNodeIdAtom)).toBeNull();
    expect(store.get(workflowEditorSelectedEdgeIdAtom)).toBe("edge-1");
  });

  test("does not clear externally-driven selection on empty selection change", () => {
    const first = createNode({ id: "node-a", type: "trigger" });
    const second = createNode({ id: "node-b", type: "action" });
    const { store, canvasProps } = renderCanvas({
      nodes: [first, second],
      selectedNodeId: "node-b",
    });

    act(() => {
      canvasProps.onSelectionChange?.({
        nodes: [],
        edges: [],
      });
    });

    expect(store.get(workflowEditorSelectedNodeIdAtom)).toBe("node-b");

    act(() => {
      canvasProps.onPaneClick?.();
    });

    expect(store.get(workflowEditorSelectedNodeIdAtom)).toBeNull();
    expect(store.get(workflowEditorSelectedEdgeIdAtom)).toBeNull();
  });

  test("adds initial trigger when empty placeholder node is clicked", () => {
    const { store, canvasProps } = renderCanvas({
      nodes: [],
      isLoaded: false,
      canEdit: true,
    });

    act(() => {
      canvasProps.onNodeClick?.({} as MouseEvent, {
        id: "__empty-placeholder__",
      });
    });

    const nodes = store.get(workflowEditorNodesAtom);
    expect(nodes.some((node) => node.id === "trigger-node")).toBeTrue();
    expect(store.get(workflowEditorSelectedNodeIdAtom)).toBe("trigger-node");
  });
});
