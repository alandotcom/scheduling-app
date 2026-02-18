/// <reference lib="dom" />

import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ReactElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { useFocusZones, useKeyboardShortcuts } from "./use-keyboard-shortcuts";

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

function dispatchKeyWithInit(
  key: string,
  init: Omit<KeyboardEventInit, "key" | "bubbles">,
  target?: HTMLElement,
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    ...init,
  });
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

function ScopeShortcutHarness({
  onGlobal,
  onModal,
}: {
  onGlobal: () => void;
  onModal: () => void;
}) {
  useKeyboardShortcuts({
    shortcuts: [{ key: "x", action: onGlobal }],
  });
  useKeyboardShortcuts({
    shortcuts: [{ key: "x", action: onModal }],
    scope: "modal",
  });

  return (
    <div>
      <div aria-modal="true">
        <button type="button" aria-label="inside-modal">
          Inside modal
        </button>
      </div>
      <button type="button" aria-label="outside-modal">
        Outside
      </button>
    </div>
  );
}

function AllScopeSequenceHarness({ onNavigate }: { onNavigate: () => void }) {
  useKeyboardShortcuts({
    shortcuts: [{ key: "g a", action: onNavigate }],
    scope: "all",
  });

  return (
    <div>
      <div aria-modal="true">
        <button type="button" aria-label="inside-modal">
          Inside modal
        </button>
      </div>
      <button type="button" aria-label="outside-modal">
        Outside
      </button>
    </div>
  );
}

function ModalPrioritySequenceHarness({
  onNavigate,
  onModalG,
}: {
  onNavigate: () => void;
  onModalG: () => void;
}) {
  useKeyboardShortcuts({
    shortcuts: [{ key: "g a", action: onNavigate }],
    scope: "all",
  });
  useKeyboardShortcuts({
    shortcuts: [{ key: "g", action: onModalG }],
    scope: "modal",
  });

  return (
    <div>
      <div aria-modal="true">
        <button type="button" aria-label="inside-modal">
          Inside modal
        </button>
      </div>
    </div>
  );
}

function FocusZonesHarness({
  detailOpen,
  onEscape,
}: {
  detailOpen: boolean;
  onEscape: () => void;
}) {
  useFocusZones({
    detailOpen,
    onEscape,
  });

  return <input aria-label="focus-zones-input" />;
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

  test("suppresses global shortcuts and allows modal-scoped shortcuts in active modals", () => {
    const onGlobal = mock(() => {});
    const onModal = mock(() => {});

    const view = renderHarness(
      <ScopeShortcutHarness onGlobal={onGlobal} onModal={onModal} />,
    );
    const insideModal = view.getByRole("button", { name: "inside-modal" });
    const outsideModal = view.getByRole("button", { name: "outside-modal" });

    dispatchKey("x", insideModal);
    expect(onGlobal).toHaveBeenCalledTimes(0);
    expect(onModal).toHaveBeenCalledTimes(1);

    dispatchKey("x", outsideModal);
    expect(onGlobal).toHaveBeenCalledTimes(0);
    expect(onModal).toHaveBeenCalledTimes(1);
  });

  test("allows all-scoped sequence shortcuts inside active modals", () => {
    const onNavigate = mock(() => {});
    const view = renderHarness(
      <AllScopeSequenceHarness onNavigate={onNavigate} />,
    );
    const insideModal = view.getByRole("button", { name: "inside-modal" });

    dispatchKey("g", insideModal);
    dispatchKey("a", insideModal);

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  test("prioritizes modal-scoped g shortcuts over all-scoped g sequences", () => {
    const onNavigate = mock(() => {});
    const onModalG = mock(() => {});
    const view = renderHarness(
      <ModalPrioritySequenceHarness
        onNavigate={onNavigate}
        onModalG={onModalG}
      />,
    );
    const insideModal = view.getByRole("button", { name: "inside-modal" });

    dispatchKey("g", insideModal);
    dispatchKey("a", insideModal);

    expect(onModalG).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(0);
  });

  test("normalizes Ctrl/Cmd keys for modified shortcuts", () => {
    const onShortcut = mock(() => {});
    renderHarness(
      <DynamicShortcutHarness shortcutKey="meta+enter" onAction={onShortcut} />,
    );

    dispatchKeyWithInit("Enter", { metaKey: true });
    dispatchKeyWithInit("Enter", { ctrlKey: true });

    expect(onShortcut).toHaveBeenCalledTimes(1);
  });

  test("closes detail immediately on escape when detail panel is open", () => {
    const onEscape = mock(() => {});
    const view = renderHarness(
      <FocusZonesHarness detailOpen onEscape={onEscape} />,
    );
    const input = view.getByRole("textbox", {
      name: "focus-zones-input",
    });

    input.focus();
    dispatchKey("Escape", input);

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  test("blurs focused input instead of closing when detail panel is closed", () => {
    const onEscape = mock(() => {});
    const view = renderHarness(
      <FocusZonesHarness detailOpen={false} onEscape={onEscape} />,
    );
    const input = view.getByRole("textbox", {
      name: "focus-zones-input",
    });

    input.focus();
    expect(document.activeElement).toBe(input);

    dispatchKey("Escape", input);

    expect(onEscape).toHaveBeenCalledTimes(0);
    expect(document.activeElement).not.toBe(input);
  });
});
