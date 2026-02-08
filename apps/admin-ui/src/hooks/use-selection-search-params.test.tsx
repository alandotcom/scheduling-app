// Tests for useValidateSelection hook

import { describe, expect, test, mock } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useValidateSelection } from "./use-selection-search-params";

type HookProps = {
  items: Array<{ id: string }> | Set<string> | undefined;
  selectedId: string | null;
  isDataResolved: boolean;
  onInvalidSelection: () => void;
};

function renderValidateSelectionHook(props: HookProps) {
  return renderHook(
    ({ items, selectedId, isDataResolved, onInvalidSelection }: HookProps) =>
      useValidateSelection({
        items,
        selectedId,
        isDataResolved,
        onInvalidSelection,
      }),
    {
      initialProps: props,
    },
  );
}

describe("useValidateSelection", () => {
  test("does not call onInvalidSelection when selectedId is null", () => {
    const onInvalidSelection = mock(() => {});
    const items = [{ id: "1" }, { id: "2" }];

    const { unmount } = renderValidateSelectionHook({
      items,
      selectedId: null,
      isDataResolved: true,
      onInvalidSelection,
    });

    expect(onInvalidSelection).not.toHaveBeenCalled();
    unmount();
  });

  test("does not call onInvalidSelection when items is undefined", () => {
    const onInvalidSelection = mock(() => {});

    const { unmount } = renderValidateSelectionHook({
      items: undefined,
      selectedId: "1",
      isDataResolved: true,
      onInvalidSelection,
    });

    expect(onInvalidSelection).not.toHaveBeenCalled();
    unmount();
  });

  test("does not call onInvalidSelection while data is unresolved", () => {
    const onInvalidSelection = mock(() => {});
    const items = [{ id: "1" }, { id: "2" }];

    const { unmount } = renderValidateSelectionHook({
      items,
      selectedId: "not-found",
      isDataResolved: false,
      onInvalidSelection,
    });

    expect(onInvalidSelection).not.toHaveBeenCalled();
    unmount();
  });

  test("does not call onInvalidSelection when selectedId exists in array items", () => {
    const onInvalidSelection = mock(() => {});
    const items = [{ id: "1" }, { id: "2" }, { id: "3" }];

    const { unmount } = renderValidateSelectionHook({
      items,
      selectedId: "2",
      isDataResolved: true,
      onInvalidSelection,
    });

    expect(onInvalidSelection).not.toHaveBeenCalled();
    unmount();
  });

  test("calls onInvalidSelection when selectedId does not exist in array items", () => {
    const onInvalidSelection = mock(() => {});
    const items = [{ id: "1" }, { id: "2" }];

    const { unmount } = renderValidateSelectionHook({
      items,
      selectedId: "not-found",
      isDataResolved: true,
      onInvalidSelection,
    });

    expect(onInvalidSelection).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("works with Set items - does not clear when ID exists", () => {
    const onInvalidSelection = mock(() => {});
    const items = new Set(["1", "2", "3"]);

    const { unmount } = renderValidateSelectionHook({
      items,
      selectedId: "2",
      isDataResolved: true,
      onInvalidSelection,
    });

    expect(onInvalidSelection).not.toHaveBeenCalled();
    unmount();
  });

  test("works with Set items - clears when ID does not exist", () => {
    const onInvalidSelection = mock(() => {});
    const items = new Set(["1", "2", "3"]);

    const { unmount } = renderValidateSelectionHook({
      items,
      selectedId: "not-found",
      isDataResolved: true,
      onInvalidSelection,
    });

    expect(onInvalidSelection).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("clears selection when items change and selectedId no longer exists", () => {
    const onInvalidSelection = mock(() => {});
    const initialItems = [{ id: "1" }, { id: "2" }];

    const { rerender, unmount } = renderValidateSelectionHook({
      items: initialItems,
      selectedId: "2",
      isDataResolved: true,
      onInvalidSelection,
    });

    expect(onInvalidSelection).not.toHaveBeenCalled();

    // Update items to remove selected ID
    const newItems = [{ id: "1" }, { id: "3" }];
    rerender({
      items: newItems,
      selectedId: "2",
      isDataResolved: true,
      onInvalidSelection,
    });

    expect(onInvalidSelection).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("works with empty array", () => {
    const onInvalidSelection = mock(() => {});
    const items: Array<{ id: string }> = [];

    const { unmount } = renderValidateSelectionHook({
      items,
      selectedId: "1",
      isDataResolved: true,
      onInvalidSelection,
    });

    expect(onInvalidSelection).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("works with empty Set", () => {
    const onInvalidSelection = mock(() => {});
    const items = new Set<string>();

    const { unmount } = renderValidateSelectionHook({
      items,
      selectedId: "1",
      isDataResolved: true,
      onInvalidSelection,
    });

    expect(onInvalidSelection).toHaveBeenCalledTimes(1);
    unmount();
  });
});
