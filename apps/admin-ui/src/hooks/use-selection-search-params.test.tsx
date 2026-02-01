// Tests for useValidateSelection hook

import { describe, expect, test, mock } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useValidateSelection } from "./use-selection-search-params";

// Test wrapper component
function TestComponent({
  items,
  selectedId,
  clearDetails,
}: {
  items: Array<{ id: string }> | Set<string> | undefined;
  selectedId: string | null;
  clearDetails: () => void;
}) {
  useValidateSelection(items, selectedId, clearDetails);
  return null;
}

function renderHook(props: {
  items: Array<{ id: string }> | Set<string> | undefined;
  selectedId: string | null;
  clearDetails: () => void;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<TestComponent {...props} />);
  });

  const rerender = (newProps: typeof props) => {
    act(() => {
      root.render(<TestComponent {...newProps} />);
    });
  };

  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  return { rerender, unmount };
}

describe("useValidateSelection", () => {
  test("does not call clearDetails when selectedId is null", () => {
    const clearDetails = mock(() => {});
    const items = [{ id: "1" }, { id: "2" }];

    const { unmount } = renderHook({
      items,
      selectedId: null,
      clearDetails,
    });

    expect(clearDetails).not.toHaveBeenCalled();
    unmount();
  });

  test("does not call clearDetails when items is undefined", () => {
    const clearDetails = mock(() => {});

    const { unmount } = renderHook({
      items: undefined,
      selectedId: "1",
      clearDetails,
    });

    expect(clearDetails).not.toHaveBeenCalled();
    unmount();
  });

  test("does not call clearDetails when selectedId exists in array items", () => {
    const clearDetails = mock(() => {});
    const items = [{ id: "1" }, { id: "2" }, { id: "3" }];

    const { unmount } = renderHook({
      items,
      selectedId: "2",
      clearDetails,
    });

    expect(clearDetails).not.toHaveBeenCalled();
    unmount();
  });

  test("calls clearDetails when selectedId does not exist in array items", () => {
    const clearDetails = mock(() => {});
    const items = [{ id: "1" }, { id: "2" }];

    const { unmount } = renderHook({
      items,
      selectedId: "not-found",
      clearDetails,
    });

    expect(clearDetails).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("works with Set items - does not clear when ID exists", () => {
    const clearDetails = mock(() => {});
    const items = new Set(["1", "2", "3"]);

    const { unmount } = renderHook({
      items,
      selectedId: "2",
      clearDetails,
    });

    expect(clearDetails).not.toHaveBeenCalled();
    unmount();
  });

  test("works with Set items - clears when ID does not exist", () => {
    const clearDetails = mock(() => {});
    const items = new Set(["1", "2", "3"]);

    const { unmount } = renderHook({
      items,
      selectedId: "not-found",
      clearDetails,
    });

    expect(clearDetails).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("clears selection when items change and selectedId no longer exists", () => {
    const clearDetails = mock(() => {});
    const initialItems = [{ id: "1" }, { id: "2" }];

    const { rerender, unmount } = renderHook({
      items: initialItems,
      selectedId: "2",
      clearDetails,
    });

    expect(clearDetails).not.toHaveBeenCalled();

    // Update items to remove selected ID
    const newItems = [{ id: "1" }, { id: "3" }];
    rerender({
      items: newItems,
      selectedId: "2",
      clearDetails,
    });

    expect(clearDetails).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("works with empty array", () => {
    const clearDetails = mock(() => {});
    const items: Array<{ id: string }> = [];

    const { unmount } = renderHook({
      items,
      selectedId: "1",
      clearDetails,
    });

    expect(clearDetails).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("works with empty Set", () => {
    const clearDetails = mock(() => {});
    const items = new Set<string>();

    const { unmount } = renderHook({
      items,
      selectedId: "1",
      clearDetails,
    });

    expect(clearDetails).toHaveBeenCalledTimes(1);
    unmount();
  });
});
