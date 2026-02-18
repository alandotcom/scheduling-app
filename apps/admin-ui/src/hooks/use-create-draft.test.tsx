import { describe, expect, test } from "bun:test";
import { act } from "react";
import { renderHook } from "@testing-library/react";

import { useCreateDraft } from "./use-create-draft";

describe("useCreateDraft", () => {
  test("initializes with provided defaults", () => {
    const hook = renderHook(() =>
      useCreateDraft({
        key: "create-draft:init",
        initialValues: { name: "", count: 1 },
      }),
    );

    expect(hook.result.current.draft).toEqual({ name: "", count: 1 });
    expect(hook.result.current.hasDraft).toBe(false);
    hook.unmount();
  });

  test("persists draft values across remounts for the same key", () => {
    const firstHook = renderHook(() =>
      useCreateDraft({
        key: "create-draft:persist",
        initialValues: { name: "", count: 1 },
      }),
    );

    act(() => {
      firstHook.result.current.setDraft({ name: "Draft", count: 2 });
    });

    expect(firstHook.result.current.hasDraft).toBe(true);
    firstHook.unmount();

    const secondHook = renderHook(() =>
      useCreateDraft({
        key: "create-draft:persist",
        initialValues: { name: "", count: 1 },
      }),
    );

    expect(secondHook.result.current.draft).toEqual({
      name: "Draft",
      count: 2,
    });
    expect(secondHook.result.current.hasDraft).toBe(true);
    secondHook.unmount();
  });

  test("resetDraft clears persisted values and returns to defaults", () => {
    const hook = renderHook(() =>
      useCreateDraft({
        key: "create-draft:reset",
        initialValues: { name: "", count: 1 },
      }),
    );

    act(() => {
      hook.result.current.setDraft({ name: "Dirty", count: 3 });
    });
    expect(hook.result.current.hasDraft).toBe(true);

    act(() => {
      hook.result.current.resetDraft();
    });

    expect(hook.result.current.draft).toEqual({ name: "", count: 1 });
    expect(hook.result.current.hasDraft).toBe(false);
    hook.unmount();
  });

  test("does not retain draft when value matches defaults", () => {
    const hook = renderHook(() =>
      useCreateDraft({
        key: "create-draft:match-defaults",
        initialValues: { name: "", count: 1 },
      }),
    );

    act(() => {
      hook.result.current.setDraft({ name: "", count: 1 });
    });

    expect(hook.result.current.hasDraft).toBe(false);
    hook.unmount();
  });
});
