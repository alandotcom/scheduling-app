/// <reference lib="dom" />

import { afterEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { useResetFormOnOpen } from "./use-reset-form-on-open";

type FormValues = { name: string };

type HookProps = {
  open: boolean;
  entityKey: string | null;
  values: FormValues | null;
  reset: (values: FormValues) => void;
  onReset?: () => void;
};

type Cleanup = () => void;

let cleanup: Cleanup | null = null;

function TestComponent(props: HookProps) {
  useResetFormOnOpen(props);
  return null;
}

function renderHook(props: HookProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<TestComponent {...props} />);
  });

  cleanup = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  const rerender = (nextProps: HookProps) => {
    act(() => {
      root.render(<TestComponent {...nextProps} />);
    });
  };

  return { rerender };
}

afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.innerHTML = "";
});

describe("useResetFormOnOpen", () => {
  test("resets on open transition", () => {
    const reset = mock((_values: FormValues) => {});
    const onReset = mock(() => {});
    const { rerender } = renderHook({
      open: false,
      entityKey: "a",
      values: { name: "Alpha" },
      reset,
      onReset,
    });

    expect(reset).not.toHaveBeenCalled();
    expect(onReset).not.toHaveBeenCalled();

    rerender({
      open: true,
      entityKey: "a",
      values: { name: "Alpha" },
      reset,
      onReset,
    });

    expect(reset).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledWith({ name: "Alpha" });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  test("resets when entity key changes while open", () => {
    const reset = mock((_values: FormValues) => {});
    const { rerender } = renderHook({
      open: true,
      entityKey: "a",
      values: { name: "Alpha" },
      reset,
    });

    expect(reset).toHaveBeenCalledTimes(1);

    rerender({
      open: true,
      entityKey: "b",
      values: { name: "Beta" },
      reset,
    });

    expect(reset).toHaveBeenCalledTimes(2);
    expect(reset).toHaveBeenLastCalledWith({ name: "Beta" });
  });

  test("does not reset on rerender with same key while open", () => {
    const reset = mock((_values: FormValues) => {});
    const { rerender } = renderHook({
      open: true,
      entityKey: "a",
      values: { name: "Alpha" },
      reset,
    });

    expect(reset).toHaveBeenCalledTimes(1);

    rerender({
      open: true,
      entityKey: "a",
      values: { name: "Alpha updated" },
      reset,
    });

    expect(reset).toHaveBeenCalledTimes(1);
  });

  test("resets again when reopened with same key", () => {
    const reset = mock((_values: FormValues) => {});
    const { rerender } = renderHook({
      open: true,
      entityKey: "a",
      values: { name: "Alpha" },
      reset,
    });

    expect(reset).toHaveBeenCalledTimes(1);

    rerender({
      open: false,
      entityKey: "a",
      values: { name: "Alpha" },
      reset,
    });

    rerender({
      open: true,
      entityKey: "a",
      values: { name: "Alpha" },
      reset,
    });

    expect(reset).toHaveBeenCalledTimes(2);
  });

  test("skips reset when values are null", () => {
    const reset = mock((_values: FormValues) => {});
    const { rerender } = renderHook({
      open: false,
      entityKey: "a",
      values: null,
      reset,
    });

    rerender({
      open: true,
      entityKey: "a",
      values: null,
      reset,
    });

    expect(reset).not.toHaveBeenCalled();
  });

  test("calls onReset for each reset", () => {
    const reset = mock((_values: FormValues) => {});
    const onReset = mock(() => {});
    const { rerender } = renderHook({
      open: true,
      entityKey: "a",
      values: { name: "Alpha" },
      reset,
      onReset,
    });

    rerender({
      open: true,
      entityKey: "b",
      values: { name: "Beta" },
      reset,
      onReset,
    });

    expect(reset).toHaveBeenCalledTimes(2);
    expect(onReset).toHaveBeenCalledTimes(2);
  });
});
