/// <reference lib="dom" />

import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { DrawerTab, DrawerTabs } from "@/components/drawer";

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

afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.innerHTML = "";
});

describe("drawer tabs", () => {
  test("marks active tab and switches via onValueChange", () => {
    const changes: string[] = [];

    render(
      <DrawerTabs
        value="details"
        onValueChange={(value) => {
          changes.push(value);
        }}
      >
        <DrawerTab value="details">Details</DrawerTab>
        <DrawerTab value="history">History</DrawerTab>
      </DrawerTabs>,
    );

    const tabs = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[role=tab]"),
    );
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("false");

    act(() => {
      tabs[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(changes).toEqual(["history"]);
  });
});
