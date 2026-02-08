import { describe, expect, test } from "bun:test";
import { act } from "react";
import { renderHook } from "@testing-library/react";
import { useUrlDrivenModal } from "./use-url-driven-modal";

interface HookProps {
  selectedId: string | null;
  hasResolvedEntity: boolean;
}

function renderModalHook({ selectedId, hasResolvedEntity }: HookProps) {
  return renderHook((props: HookProps) => useUrlDrivenModal(props), {
    initialProps: { selectedId, hasResolvedEntity },
  });
}

describe("useUrlDrivenModal", () => {
  test("opens when selectedId exists and entity is resolved", () => {
    const hook = renderModalHook({
      selectedId: "resource-1",
      hasResolvedEntity: true,
    });
    expect(hook.result.current.isOpen).toBe(true);
    hook.unmount();
  });

  test("stays closed when selectedId exists but entity is unresolved", () => {
    const hook = renderModalHook({
      selectedId: "resource-1",
      hasResolvedEntity: false,
    });
    expect(hook.result.current.isOpen).toBe(false);
    hook.unmount();
  });

  test("closeNow closes immediately while selectedId is still set", () => {
    const hook = renderModalHook({
      selectedId: "resource-1",
      hasResolvedEntity: true,
    });
    expect(hook.result.current.isOpen).toBe(true);

    act(() => {
      hook.result.current.closeNow();
    });

    expect(hook.result.current.isOpen).toBe(false);
    hook.unmount();
  });

  test("resets dismissal when selectedId changes", () => {
    const hook = renderModalHook({
      selectedId: "resource-1",
      hasResolvedEntity: true,
    });

    act(() => {
      hook.result.current.closeNow();
    });
    expect(hook.result.current.isOpen).toBe(false);

    hook.rerender({ selectedId: "resource-2", hasResolvedEntity: true });
    expect(hook.result.current.isOpen).toBe(true);
    hook.unmount();
  });

  test("stays closed when selectedId is cleared", () => {
    const hook = renderModalHook({
      selectedId: "resource-1",
      hasResolvedEntity: true,
    });
    expect(hook.result.current.isOpen).toBe(true);

    hook.rerender({ selectedId: null, hasResolvedEntity: false });
    expect(hook.result.current.isOpen).toBe(false);
    hook.unmount();
  });
});
