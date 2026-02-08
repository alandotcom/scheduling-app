/// <reference lib="dom" />

import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";

import { useResetFormOnOpen } from "./use-reset-form-on-open";

type FormValues = { name: string };

type HookProps = {
  open: boolean;
  entityKey: string | null;
  values: FormValues | null;
  reset: (values: FormValues) => void;
  onReset?: () => void;
};

function renderResetFormHook(props: HookProps) {
  return renderHook((nextProps: HookProps) => useResetFormOnOpen(nextProps), {
    initialProps: props,
  });
}

afterEach(() => {
  cleanup();
});

describe("useResetFormOnOpen", () => {
  test("resets on open transition", () => {
    const reset = mock((_values: FormValues) => {});
    const onReset = mock(() => {});
    const { rerender } = renderResetFormHook({
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
    const { rerender } = renderResetFormHook({
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
    const { rerender } = renderResetFormHook({
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
    const { rerender } = renderResetFormHook({
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
    const { rerender } = renderResetFormHook({
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
    const { rerender } = renderResetFormHook({
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
