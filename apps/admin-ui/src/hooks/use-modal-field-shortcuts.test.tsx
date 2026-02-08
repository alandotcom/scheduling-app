/// <reference lib="dom" />

import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useModalFieldShortcuts } from "./use-modal-field-shortcuts";

function dispatchKey(key: string, target: HTMLElement) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true });
  Object.defineProperty(event, "target", { value: target });
  document.dispatchEvent(event);
}

function ModalFieldShortcutHarness({
  autoHideMs = 1500,
}: {
  autoHideMs?: number;
}) {
  const { hintsVisible, registerField } = useModalFieldShortcuts({
    enabled: true,
    autoHideMs,
    fields: [{ id: "name", key: "n", description: "Focus name" }],
  });

  return (
    <div aria-modal="true">
      <button type="button" aria-label="outside-focus">
        Outside
      </button>
      <div ref={registerField("name")}>
        <input aria-label="name-input" />
      </div>
      <output aria-label="hints-state">{hintsVisible ? "on" : "off"}</output>
    </div>
  );
}

afterEach(() => {
  cleanup();
});

describe("useModalFieldShortcuts", () => {
  test("toggles hints with g and focuses mapped field", () => {
    const view = render(<ModalFieldShortcutHarness />);

    const outside = view.getByRole("button", { name: "outside-focus" });
    const input = view.getByRole("textbox", { name: "name-input" });

    // <output> is not announced as status in HappyDOM; query by label instead.
    const hintState = view.getByLabelText("hints-state");

    act(() => {
      dispatchKey("g", outside);
    });
    expect(hintState.textContent).toBe("on");

    act(() => {
      dispatchKey("n", outside);
    });
    expect(hintState.textContent).toBe("off");
    expect(document.activeElement).toBe(input);
  });

  test("does not trigger g while typing in inputs", () => {
    const view = render(<ModalFieldShortcutHarness />);

    const input = view.getByRole("textbox", { name: "name-input" });
    const hintState = view.getByLabelText("hints-state");

    act(() => {
      dispatchKey("g", input);
    });
    expect(hintState.textContent).toBe("off");
  });

  test("auto-hides hints after timeout", async () => {
    const view = render(<ModalFieldShortcutHarness autoHideMs={30} />);

    const outside = view.getByRole("button", { name: "outside-focus" });
    const hintState = view.getByLabelText("hints-state");

    act(() => {
      dispatchKey("g", outside);
    });
    expect(hintState.textContent).toBe("on");

    await waitFor(
      () => {
        expect(hintState.textContent).toBe("off");
      },
      { timeout: 500 },
    );
  });
});
