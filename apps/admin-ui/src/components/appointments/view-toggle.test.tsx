// Tests for ViewToggle component

import { describe, expect, test, mock } from "bun:test";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ViewToggle } from "./view-toggle";

function render(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(ui);
  });

  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  return { container, unmount };
}

describe("ViewToggle", () => {
  test("renders list and schedule buttons", () => {
    const onViewChange = mock(() => {});
    const { container, unmount } = render(
      <ViewToggle view="list" onViewChange={onViewChange} />,
    );

    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    expect(buttons[0]?.textContent).toContain("List");
    expect(buttons[1]?.textContent).toContain("Schedule");

    unmount();
  });

  test("highlights list button when view is list", () => {
    const onViewChange = mock(() => {});
    const { container, unmount } = render(
      <ViewToggle view="list" onViewChange={onViewChange} />,
    );

    const buttons = container.querySelectorAll("button");
    // List button should have active styles (bg-background)
    expect(buttons[0]?.className).toContain("bg-background");
    // Schedule button should not have active styles
    expect(buttons[1]?.className).not.toContain("bg-background");

    unmount();
  });

  test("highlights schedule button when view is schedule", () => {
    const onViewChange = mock(() => {});
    const { container, unmount } = render(
      <ViewToggle view="schedule" onViewChange={onViewChange} />,
    );

    const buttons = container.querySelectorAll("button");
    // List button should not have active styles
    expect(buttons[0]?.className).not.toContain("bg-background");
    // Schedule button should have active styles
    expect(buttons[1]?.className).toContain("bg-background");

    unmount();
  });

  test("calls onViewChange with list when list button is clicked", () => {
    const onViewChange = mock(() => {});
    const { container, unmount } = render(
      <ViewToggle view="schedule" onViewChange={onViewChange} />,
    );

    const buttons = container.querySelectorAll("button");
    act(() => {
      buttons[0]?.click();
    });

    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith("list");

    unmount();
  });

  test("calls onViewChange with schedule when schedule button is clicked", () => {
    const onViewChange = mock(() => {});
    const { container, unmount } = render(
      <ViewToggle view="list" onViewChange={onViewChange} />,
    );

    const buttons = container.querySelectorAll("button");
    act(() => {
      buttons[1]?.click();
    });

    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith("schedule");

    unmount();
  });

  test("clicking already-active button still calls onViewChange", () => {
    const onViewChange = mock(() => {});
    const { container, unmount } = render(
      <ViewToggle view="list" onViewChange={onViewChange} />,
    );

    const buttons = container.querySelectorAll("button");
    act(() => {
      buttons[0]?.click(); // Click the already active list button
    });

    // Should still call the handler - parent can decide whether to act on it
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith("list");

    unmount();
  });
});
