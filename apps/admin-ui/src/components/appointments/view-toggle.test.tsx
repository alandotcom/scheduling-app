// Tests for ViewToggle component

import { afterEach, describe, expect, test, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ViewToggle } from "./view-toggle";

afterEach(() => {
  cleanup();
});

describe("ViewToggle", () => {
  test("renders list and schedule buttons", () => {
    const onViewChange = mock(() => {});
    const { container } = render(
      <ViewToggle view="list" onViewChange={onViewChange} />,
    );

    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    expect(buttons[0]?.textContent).toContain("List");
    expect(buttons[1]?.textContent).toContain("Schedule");
  });

  test("highlights list button when view is list", () => {
    const onViewChange = mock(() => {});
    const { container } = render(
      <ViewToggle view="list" onViewChange={onViewChange} />,
    );

    const buttons = container.querySelectorAll("button");
    // List button should have active styles (bg-background)
    expect(buttons[0]?.className).toContain("bg-background");
    // Schedule button should not have active styles
    expect(buttons[1]?.className).not.toContain("bg-background");
  });

  test("highlights schedule button when view is schedule", () => {
    const onViewChange = mock(() => {});
    const { container } = render(
      <ViewToggle view="schedule" onViewChange={onViewChange} />,
    );

    const buttons = container.querySelectorAll("button");
    // List button should not have active styles
    expect(buttons[0]?.className).not.toContain("bg-background");
    // Schedule button should have active styles
    expect(buttons[1]?.className).toContain("bg-background");
  });

  test("calls onViewChange with list when list button is clicked", () => {
    const onViewChange = mock(() => {});
    const { container } = render(
      <ViewToggle view="schedule" onViewChange={onViewChange} />,
    );

    const buttons = container.querySelectorAll("button");
    fireEvent.click(buttons[0] as HTMLButtonElement);

    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith("list");
  });

  test("calls onViewChange with schedule when schedule button is clicked", () => {
    const onViewChange = mock(() => {});
    const { container } = render(
      <ViewToggle view="list" onViewChange={onViewChange} />,
    );

    const buttons = container.querySelectorAll("button");
    fireEvent.click(buttons[1] as HTMLButtonElement);

    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith("schedule");
  });

  test("clicking already-active button still calls onViewChange", () => {
    const onViewChange = mock(() => {});
    const { container } = render(
      <ViewToggle view="list" onViewChange={onViewChange} />,
    );

    const buttons = container.querySelectorAll("button");
    fireEvent.click(buttons[0] as HTMLButtonElement); // Click the already active list button

    // Should still call the handler - parent can decide whether to act on it
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith("list");
  });
});
