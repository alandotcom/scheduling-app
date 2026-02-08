/// <reference lib="dom" />

import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ReactElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

function renderHarness(ui: ReactElement) {
  return render(ui);
}

function dispatchKey(key: string, target?: HTMLElement) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true });
  if (target) {
    Object.defineProperty(event, "target", { value: target });
  }
  document.dispatchEvent(event);
}

function MultiShortcutHarness({
  onAlpha,
  onBeta,
}: {
  onAlpha: () => void;
  onBeta: () => void;
}) {
  useKeyboardShortcuts({
    shortcuts: [{ key: "a", action: onAlpha }],
  });
  useKeyboardShortcuts({
    shortcuts: [{ key: "b", action: onBeta }],
  });

  return <input aria-label="keyboard-input" />;
}

function DynamicShortcutHarness({
  shortcutKey,
  onAction,
}: {
  shortcutKey: string;
  onAction: () => void;
}) {
  useKeyboardShortcuts({
    shortcuts: [{ key: shortcutKey, action: onAction }],
  });
  return null;
}

function InputShortcutHarness({
  onDefault,
  onForced,
}: {
  onDefault: () => void;
  onForced: () => void;
}) {
  useKeyboardShortcuts({
    shortcuts: [{ key: "x", action: onDefault }],
  });
  useKeyboardShortcuts({
    shortcuts: [{ key: "x", action: onForced, ignoreInputs: false }],
  });
  return <input aria-label="target-input" />;
}

afterEach(() => {
  cleanup();
});

describe("useKeyboardShortcuts", () => {
  test("attaches only one global keydown listener for multiple hook consumers", () => {
    const onAlpha = mock(() => {});
    const onBeta = mock(() => {});

    const originalAdd = document.addEventListener.bind(document);
    const originalRemove = document.removeEventListener.bind(document);
    let addKeydownCount = 0;
    let removeKeydownCount = 0;

    document.addEventListener = ((
      ...args: Parameters<Document["addEventListener"]>
    ) => {
      const [type, listener, options] = args;
      if (type === "keydown") addKeydownCount += 1;
      originalAdd(type, listener, options);
    }) as typeof document.addEventListener;

    document.removeEventListener = ((
      ...args: Parameters<Document["removeEventListener"]>
    ) => {
      const [type, listener, options] = args;
      if (type === "keydown") removeKeydownCount += 1;
      originalRemove(type, listener, options);
    }) as typeof document.removeEventListener;

    let view: ReturnType<typeof renderHarness> | null = null;
    try {
      view = renderHarness(
        <MultiShortcutHarness onAlpha={onAlpha} onBeta={onBeta} />,
      );

      expect(addKeydownCount).toBe(1);

      dispatchKey("a");
      dispatchKey("b");

      expect(onAlpha).toHaveBeenCalledTimes(1);
      expect(onBeta).toHaveBeenCalledTimes(1);
    } finally {
      view?.unmount();

      expect(removeKeydownCount).toBe(1);
      document.addEventListener =
        originalAdd as typeof document.addEventListener;
      document.removeEventListener =
        originalRemove as typeof document.removeEventListener;
    }
  });

  test("uses latest shortcut definitions without re-attaching listeners", () => {
    const onAction = mock(() => {});
    const originalAdd = document.addEventListener.bind(document);
    let addKeydownCount = 0;

    document.addEventListener = ((
      ...args: Parameters<Document["addEventListener"]>
    ) => {
      const [type, listener, options] = args;
      if (type === "keydown") addKeydownCount += 1;
      originalAdd(type, listener, options);
    }) as typeof document.addEventListener;

    try {
      const view = renderHarness(
        <DynamicShortcutHarness shortcutKey="a" onAction={onAction} />,
      );

      dispatchKey("a");
      expect(onAction).toHaveBeenCalledTimes(1);
      expect(addKeydownCount).toBe(1);

      view.rerender(
        <DynamicShortcutHarness shortcutKey="z" onAction={onAction} />,
      );

      dispatchKey("a");
      dispatchKey("z");
      expect(onAction).toHaveBeenCalledTimes(2);
      expect(addKeydownCount).toBe(1);
    } finally {
      document.addEventListener =
        originalAdd as typeof document.addEventListener;
    }
  });

  test("ignores input events by default, unless ignoreInputs is false", () => {
    const onDefault = mock(() => {});
    const onForced = mock(() => {});

    renderHarness(
      <InputShortcutHarness onDefault={onDefault} onForced={onForced} />,
    );

    const input = document.querySelector("input");
    expect(input).not.toBeNull();

    if (input) {
      dispatchKey("x", input);
    }

    expect(onDefault).toHaveBeenCalledTimes(0);
    expect(onForced).toHaveBeenCalledTimes(1);
  });
});
