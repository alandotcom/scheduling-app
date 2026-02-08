import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useUrlDrivenModal } from "./use-url-driven-modal";

interface HookState {
  isOpen: boolean;
  closeNow: () => void;
}

function TestComponent({
  selectedId,
  hasResolvedEntity,
  onState,
}: {
  selectedId: string | null;
  hasResolvedEntity: boolean;
  onState: (state: HookState) => void;
}) {
  const state = useUrlDrivenModal({ selectedId, hasResolvedEntity });
  onState(state);
  return null;
}

function renderHook(props: {
  selectedId: string | null;
  hasResolvedEntity: boolean;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latestState: HookState | null = null;

  const render = (nextProps: typeof props) => {
    act(() => {
      root.render(
        <TestComponent
          selectedId={nextProps.selectedId}
          hasResolvedEntity={nextProps.hasResolvedEntity}
          onState={(state) => {
            latestState = state;
          }}
        />,
      );
    });
  };

  render(props);

  const rerender = (nextProps: typeof props) => render(nextProps);

  const getState = () => {
    if (!latestState) {
      throw new Error("Hook state is not available");
    }
    return latestState;
  };

  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  return { getState, rerender, unmount };
}

describe("useUrlDrivenModal", () => {
  test("opens when selectedId exists and entity is resolved", () => {
    const hook = renderHook({
      selectedId: "resource-1",
      hasResolvedEntity: true,
    });
    expect(hook.getState().isOpen).toBe(true);
    hook.unmount();
  });

  test("stays closed when selectedId exists but entity is unresolved", () => {
    const hook = renderHook({
      selectedId: "resource-1",
      hasResolvedEntity: false,
    });
    expect(hook.getState().isOpen).toBe(false);
    hook.unmount();
  });

  test("closeNow closes immediately while selectedId is still set", () => {
    const hook = renderHook({
      selectedId: "resource-1",
      hasResolvedEntity: true,
    });
    expect(hook.getState().isOpen).toBe(true);

    act(() => {
      hook.getState().closeNow();
    });

    expect(hook.getState().isOpen).toBe(false);
    hook.unmount();
  });

  test("resets dismissal when selectedId changes", () => {
    const hook = renderHook({
      selectedId: "resource-1",
      hasResolvedEntity: true,
    });

    act(() => {
      hook.getState().closeNow();
    });
    expect(hook.getState().isOpen).toBe(false);

    hook.rerender({ selectedId: "resource-2", hasResolvedEntity: true });
    expect(hook.getState().isOpen).toBe(true);
    hook.unmount();
  });

  test("stays closed when selectedId is cleared", () => {
    const hook = renderHook({
      selectedId: "resource-1",
      hasResolvedEntity: true,
    });
    expect(hook.getState().isOpen).toBe(true);

    hook.rerender({ selectedId: null, hasResolvedEntity: false });
    expect(hook.getState().isOpen).toBe(false);
    hook.unmount();
  });
});
