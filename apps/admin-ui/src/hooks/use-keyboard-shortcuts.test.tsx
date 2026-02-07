/// <reference lib="dom" />

import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

type Cleanup = () => void;
let cleanup: Cleanup | null = null;

function render(ui: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(ui);
  });

  cleanup = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
}

function dispatchKey(key: string, target?: HTMLElement) {
  act(() => {
    const event = new KeyboardEvent("keydown", { key });
    if (target) {
      Object.defineProperty(event, "target", { value: target });
    }
    document.dispatchEvent(event);
  });
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
  cleanup?.();
  cleanup = null;
  document.body.innerHTML = "";
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

    try {
      render(<MultiShortcutHarness onAlpha={onAlpha} onBeta={onBeta} />);

      expect(addKeydownCount).toBe(1);

      dispatchKey("a");
      dispatchKey("b");

      expect(onAlpha).toHaveBeenCalledTimes(1);
      expect(onBeta).toHaveBeenCalledTimes(1);
    } finally {
      cleanup?.();
      cleanup = null;

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
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      cleanup = () => {
        act(() => {
          root.unmount();
        });
        container.remove();
      };

      act(() => {
        root.render(
          <DynamicShortcutHarness shortcutKey="a" onAction={onAction} />,
        );
      });

      dispatchKey("a");
      expect(onAction).toHaveBeenCalledTimes(1);
      expect(addKeydownCount).toBe(1);

      act(() => {
        root.render(
          <DynamicShortcutHarness shortcutKey="z" onAction={onAction} />,
        );
      });

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

    render(<InputShortcutHarness onDefault={onDefault} onForced={onForced} />);

    const input = document.querySelector("input");
    expect(input).not.toBeNull();

    if (input) {
      dispatchKey("x", input);
    }

    expect(onDefault).toHaveBeenCalledTimes(0);
    expect(onForced).toHaveBeenCalledTimes(1);
  });
});
