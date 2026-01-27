/// <reference lib="dom" />

import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

import {
  DetailPanel,
  DetailTab,
  DetailTabs,
  ListPanel,
  SplitPaneLayout,
} from "@/components/split-pane";

type Cleanup = () => void;

let cleanup: Cleanup | null = null;

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function render(ui: React.ReactElement) {
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

  return container;
}

afterEach(() => {
  cleanup?.();
  cleanup = null;
  document.body.innerHTML = "";
});

describe("split-pane components", () => {
  test("renders list and detail panels on desktop", () => {
    setMatchMedia(true);

    render(
      <SplitPaneLayout>
        <ListPanel>List content</ListPanel>
        <DetailPanel open onOpenChange={() => {}}>
          <div>Detail content</div>
        </DetailPanel>
      </SplitPaneLayout>,
    );

    expect(document.querySelector("section")?.textContent).toContain(
      "List content",
    );
    expect(document.querySelector("aside")?.textContent).toContain(
      "Detail content",
    );
  });

  test("shows the default empty state when closed", () => {
    setMatchMedia(true);

    render(
      <DetailPanel open={false} onOpenChange={() => {}}>
        <div>Detail content</div>
      </DetailPanel>,
    );

    expect(document.querySelector("aside")?.textContent).toContain(
      "Select an item",
    );
  });

  test("renders sheet content on mobile", () => {
    setMatchMedia(false);

    render(
      <DetailPanel
        open
        onOpenChange={() => {}}
        sheetTitle="Details"
        sheetDescription="Mobile sheet"
      >
        <div>Detail content</div>
      </DetailPanel>,
    );

    const sheet = document.querySelector('[data-slot="sheet-content"]');
    expect(sheet).not.toBeNull();
    expect(sheet?.textContent).toContain("Detail content");
  });

  test("marks the active tab", () => {
    render(
      <DetailTabs value="details" onValueChange={() => {}}>
        <DetailTab value="details">Details</DetailTab>
        <DetailTab value="notes">Notes</DetailTab>
      </DetailTabs>,
    );

    const tabs = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[role=tab]"),
    );
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("false");
  });
});
