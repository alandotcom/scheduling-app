import { describe, expect, test } from "bun:test";
import { act } from "react";
import { renderHook } from "@testing-library/react";
import { useBufferedPending } from "./use-buffered-pending";

describe("useBufferedPending", () => {
  test("does not show pending visual when pending resolves before delay", async () => {
    const hook = renderHook(
      ({ pending }) =>
        useBufferedPending(pending, { delayMs: 80, minVisibleMs: 50 }),
      {
        initialProps: { pending: true },
      },
    );

    act(() => {
      hook.rerender({ pending: false });
    });
    await act(async () => {
      await Bun.sleep(100);
    });

    expect(hook.result.current).toBe(false);
    hook.unmount();
  });

  test("shows pending visual once delay elapses", async () => {
    const hook = renderHook(
      ({ pending }) =>
        useBufferedPending(pending, { delayMs: 20, minVisibleMs: 60 }),
      {
        initialProps: { pending: true },
      },
    );

    await act(async () => {
      await Bun.sleep(30);
    });

    expect(hook.result.current).toBe(true);
    hook.unmount();
  });

  test("keeps pending visual visible for minimum duration after pending finishes", async () => {
    const hook = renderHook(
      ({ pending }) =>
        useBufferedPending(pending, { delayMs: 10, minVisibleMs: 70 }),
      {
        initialProps: { pending: true },
      },
    );

    await act(async () => {
      await Bun.sleep(15);
    });
    expect(hook.result.current).toBe(true);

    await act(async () => {
      hook.rerender({ pending: false });
      await Bun.sleep(20);
    });
    expect(hook.result.current).toBe(true);

    await act(async () => {
      await Bun.sleep(60);
    });
    expect(hook.result.current).toBe(false);
    hook.unmount();
  });
});
