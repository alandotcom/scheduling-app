import { describe, expect, mock, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { PropsWithChildren } from "react";

import {
  useCreateIntentTrigger,
  useTriggerCreateIntent,
} from "./use-create-intent";

function createWrapper() {
  const store = createStore();
  return function Wrapper({ children }: PropsWithChildren) {
    return <Provider store={store}>{children}</Provider>;
  };
}

describe("useCreateIntentTrigger", () => {
  test("invokes callback when matching intent is triggered", () => {
    const wrapper = createWrapper();
    const onCreateTrigger = mock(() => {});

    const trigger = renderHook(() => useTriggerCreateIntent(), {
      wrapper,
    });
    const hook = renderHook(
      () => useCreateIntentTrigger("appointments", onCreateTrigger),
      {
        wrapper,
      },
    );

    expect(onCreateTrigger).toHaveBeenCalledTimes(0);
    act(() => {
      trigger.result.current("appointments");
    });
    expect(onCreateTrigger).toHaveBeenCalledTimes(1);

    hook.unmount();
    trigger.unmount();
  });

  test("consumes intent so rerenders do not retrigger callback", () => {
    const wrapper = createWrapper();
    const onCreateTrigger = mock(() => {});

    const trigger = renderHook(() => useTriggerCreateIntent(), {
      wrapper,
    });
    const hook = renderHook(
      (props: { count: number }) => {
        void props.count;
        useCreateIntentTrigger("appointments", onCreateTrigger);
      },
      {
        initialProps: { count: 0 },
        wrapper,
      },
    );

    act(() => {
      trigger.result.current("appointments");
    });
    expect(onCreateTrigger).toHaveBeenCalledTimes(1);

    hook.rerender({ count: 1 });
    expect(onCreateTrigger).toHaveBeenCalledTimes(1);

    hook.unmount();
    trigger.unmount();
  });

  test("ignores intents for other entity types", () => {
    const wrapper = createWrapper();
    const onCreateTrigger = mock(() => {});

    const trigger = renderHook(() => useTriggerCreateIntent(), {
      wrapper,
    });
    const hook = renderHook(
      () => useCreateIntentTrigger("appointments", onCreateTrigger),
      {
        wrapper,
      },
    );

    act(() => {
      trigger.result.current("clients");
    });
    expect(onCreateTrigger).toHaveBeenCalledTimes(0);

    hook.unmount();
    trigger.unmount();
  });
});
