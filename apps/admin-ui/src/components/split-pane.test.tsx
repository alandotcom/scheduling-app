/// <reference lib="dom" />

import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import {
  DetailPanel,
  DetailTab,
  DetailTabs,
  ListPanel,
  WorkbenchLayout,
} from "@/components/workbench";

type Cleanup = () => void;

let cleanup: Cleanup | null = null;

function setMatchMedia({
  docked = false,
  overlay = false,
}: {
  docked?: boolean;
  overlay?: boolean;
}) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query.includes("1280px")
        ? docked
        : query.includes("768px")
          ? overlay
          : false,
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
    setMatchMedia({ docked: true, overlay: true });

    render(
      <WorkbenchLayout>
        <ListPanel>List content</ListPanel>
        <DetailPanel open storageKey="test" onOpenChange={() => {}}>
          <div>Detail content</div>
        </DetailPanel>
      </WorkbenchLayout>,
    );

    expect(document.querySelector("section")?.textContent).toContain(
      "List content",
    );
    expect(document.querySelector("aside")?.textContent).toContain(
      "Detail content",
    );
  });

  test("shows the default empty state when closed", () => {
    setMatchMedia({ docked: true, overlay: true });

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
    setMatchMedia({ docked: false, overlay: false });

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
    const closeButton = document.querySelector('[data-slot="sheet-close"]');
    expect(closeButton).not.toBeNull();
  });

  test("renders right overlay sheet on tablet", () => {
    setMatchMedia({ docked: false, overlay: true });

    render(
      <DetailPanel open onOpenChange={() => {}}>
        <div>Tablet detail</div>
      </DetailPanel>,
    );

    const sheet = document.querySelector('[data-slot="sheet-content"]');
    expect(sheet?.className).toContain("w-[min(92vw,640px)]");
  });

  test("loads persisted docked panel width", () => {
    setMatchMedia({ docked: true, overlay: true });
    window.localStorage.setItem("workbench:appointments:detail-width", "520");

    render(
      <DetailPanel open storageKey="appointments" onOpenChange={() => {}}>
        <div>Detail content</div>
      </DetailPanel>,
    );

    const aside = document.querySelector("aside") as HTMLElement | null;
    expect(aside?.style.width).toBe("520px");
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
