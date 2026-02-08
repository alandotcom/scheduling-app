/// <reference lib="dom" />

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { DrawerTab, DrawerTabs } from "@/components/drawer";

afterEach(() => {
  cleanup();
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

    fireEvent.click(tabs[1] as HTMLButtonElement);

    expect(changes).toEqual(["history"]);
  });
});
