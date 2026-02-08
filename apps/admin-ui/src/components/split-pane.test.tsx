/// <reference lib="dom" />

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";

import {
  DetailPanel,
  DetailTab,
  DetailTabs,
  ListPanel,
  WorkbenchLayout,
} from "@/components/workbench";

afterEach(() => {
  cleanup();
});

describe("split-pane components", () => {
  test("renders list panel and detail content when open", () => {
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
    expect(document.body.textContent).toContain("Detail content");
  });

  test("does not render detail content when closed", () => {
    render(
      <DetailPanel open={false} onOpenChange={() => {}}>
        <div>Detail content</div>
      </DetailPanel>,
    );

    expect(document.body.textContent).not.toContain("Detail content");
  });

  test("renders both mobile overlay and desktop dock containers", () => {
    render(
      <DetailPanel
        open
        onOpenChange={() => {}}
        sheetTitle="Details"
        sheetDescription="Responsive detail panel"
      >
        <div>Detail content</div>
      </DetailPanel>,
    );

    const mobilePanel = document.querySelector("div.fixed.inset-0.lg\\:hidden");
    const desktopPanel = document.querySelector("aside.hidden.lg\\:flex");

    expect(mobilePanel).not.toBeNull();
    expect(desktopPanel).not.toBeNull();
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
