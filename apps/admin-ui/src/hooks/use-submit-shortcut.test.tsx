/// <reference lib="dom" />

import { afterEach, describe, expect, mock, test } from "bun:test";
import { useRef } from "react";
import { cleanup, render } from "@testing-library/react";
import { useSubmitShortcut } from "./use-submit-shortcut";

function dispatchMetaEnter(target: HTMLElement) {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    metaKey: true,
  });
  Object.defineProperty(event, "target", { value: target });
  document.dispatchEvent(event);
}

function SubmitShortcutHarness({
  onSubmit,
  enabled = true,
}: {
  onSubmit: () => void;
  enabled?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  useSubmitShortcut({
    enabled,
    onSubmit: () => formRef.current?.requestSubmit(),
  });

  return (
    <div aria-modal="true">
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input aria-label="shortcut-input" />
      </form>
    </div>
  );
}

afterEach(() => {
  cleanup();
});

describe("useSubmitShortcut", () => {
  test("submits active modal forms on Cmd+Enter", () => {
    const onSubmit = mock(() => {});
    const view = render(<SubmitShortcutHarness onSubmit={onSubmit} />);

    dispatchMetaEnter(view.getByLabelText("shortcut-input"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test("does nothing when disabled", () => {
    const onSubmit = mock(() => {});
    const view = render(
      <SubmitShortcutHarness onSubmit={onSubmit} enabled={false} />,
    );

    dispatchMetaEnter(view.getByLabelText("shortcut-input"));
    expect(onSubmit).toHaveBeenCalledTimes(0);
  });
});
