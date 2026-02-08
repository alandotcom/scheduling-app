/// <reference lib="dom" />

import { describe, expect, mock, test } from "bun:test";
import {
  getCtrlJkArrowKey,
  handleCtrlJkArrowNavigation,
} from "@/lib/keyboard-navigation";

describe("keyboard navigation helpers", () => {
  test("maps Ctrl+J/K to arrow keys", () => {
    expect(
      getCtrlJkArrowKey({
        key: "j",
        ctrlKey: true,
        altKey: false,
        metaKey: false,
      }),
    ).toBe("ArrowDown");

    expect(
      getCtrlJkArrowKey({
        key: "k",
        ctrlKey: true,
        altKey: false,
        metaKey: false,
      }),
    ).toBe("ArrowUp");

    expect(
      getCtrlJkArrowKey({
        key: "j",
        ctrlKey: false,
        altKey: false,
        metaKey: false,
      }),
    ).toBeNull();
  });

  test("dispatches arrow key events when enabled", () => {
    const target = document.createElement("button");
    let dispatchedArrowKey = "";

    target.addEventListener("keydown", (event) => {
      dispatchedArrowKey = event.key;
    });

    const preventDefault = mock(() => {});
    const stopPropagation = mock(() => {});

    const handled = handleCtrlJkArrowNavigation(
      {
        key: "j",
        ctrlKey: true,
        altKey: false,
        metaKey: false,
        target,
        preventDefault,
        stopPropagation,
      },
      true,
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(dispatchedArrowKey).toBe("ArrowDown");
  });

  test("does nothing when disabled", () => {
    const target = document.createElement("button");
    const preventDefault = mock(() => {});

    const handled = handleCtrlJkArrowNavigation(
      {
        key: "j",
        ctrlKey: true,
        target,
        preventDefault,
      },
      false,
    );

    expect(handled).toBe(false);
    expect(preventDefault).toHaveBeenCalledTimes(0);
  });
});
