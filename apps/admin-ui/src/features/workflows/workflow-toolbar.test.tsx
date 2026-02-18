import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { WorkflowToolbar } from "./workflow-toolbar";

const originalInnerWidth = window.innerWidth;

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  window.innerWidth = originalInnerWidth;
});

function renderToolbar(
  journeyStatus: "draft" | "published" | "paused",
  journeyMode: "live" | "test" = "live",
  publishWarnings: string[] = [],
) {
  const onSave = mock(() => {});
  const onPause = mock(() => {});
  const onPublish = mock((_mode: "live" | "test") => {});
  const onResume = mock(() => {});
  const onRename = mock(() => {});
  const onSetMode = mock((_mode: "live" | "test") => {});

  render(
    <ReactFlowProvider>
      <WorkflowToolbar
        canManageWorkflow={true}
        journeyStatus={journeyStatus}
        journeyMode={journeyMode}
        currentVersion={journeyStatus === "draft" ? null : 1}
        isPausing={false}
        isPublishing={false}
        isResuming={false}
        isSaving={false}
        isSettingMode={false}
        isRenaming={false}
        onPause={onPause}
        onPublish={onPublish}
        publishWarnings={publishWarnings}
        onRename={onRename}
        onResume={onResume}
        onSave={onSave}
        onSetMode={onSetMode}
      />
    </ReactFlowProvider>,
  );

  mockToolbarOverflowDimensions({
    viewportWidth: 1800,
    fullWidth: 640,
    compactWidth: 520,
    minimalWidth: 260,
  });

  return {
    onSave,
    onPause,
    onPublish,
    onRename,
    onResume,
    onSetMode,
  };
}

function mockToolbarOverflowDimensions(input: {
  viewportWidth: number;
  fullWidth: number;
  compactWidth: number;
  minimalWidth: number;
}) {
  window.innerWidth = input.viewportWidth;

  const fullMeasure = screen.getByTestId("workflow-toolbar-measure");
  const compactMeasure = screen.getByTestId("workflow-toolbar-measure-compact");
  const minimalMeasure = screen.getByTestId("workflow-toolbar-measure-minimal");

  Object.defineProperty(fullMeasure, "getBoundingClientRect", {
    value: () => ({
      left: 0,
      width: input.fullWidth,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
    configurable: true,
  });

  Object.defineProperty(compactMeasure, "getBoundingClientRect", {
    value: () => ({
      left: 0,
      width: input.compactWidth,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
    configurable: true,
  });

  Object.defineProperty(minimalMeasure, "getBoundingClientRect", {
    value: () => ({
      left: 0,
      width: input.minimalWidth,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
    configurable: true,
  });

  fireEvent(window, new Event("resize"));
}

describe("WorkflowToolbar", () => {
  test("shows publish controls for draft journeys", () => {
    renderToolbar("draft", "live");

    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Version -").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Publish" }).length,
    ).toBeGreaterThan(0);
    const liveButtons = screen.getAllByRole("button", { name: "Live" });
    const testButtons = screen.getAllByRole("button", { name: "Test" });
    for (const button of [...liveButtons, ...testButtons]) {
      expect(button.hasAttribute("disabled")).toBe(true);
    }
  });

  test("shows pause control for published journeys", () => {
    renderToolbar("published", "live");
    expect(screen.getAllByText("Version 1").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Pause" }).length,
    ).toBeGreaterThan(0);
  });

  test("shows resume control for paused journeys and disables mode switch", () => {
    renderToolbar("paused", "test");

    expect(screen.getAllByText("Paused").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Resume" }).length,
    ).toBeGreaterThan(0);

    const liveButtons = screen.getAllByRole("button", { name: "Live" });
    const testButtons = screen.getAllByRole("button", { name: "Test" });
    for (const button of [...liveButtons, ...testButtons]) {
      expect(button.hasAttribute("disabled")).toBe(true);
    }
  });

  test("wires lifecycle actions", () => {
    const draftRender = renderToolbar("draft", "live");
    fireEvent.click(screen.getAllByRole("button", { name: "Publish" })[0]!);
    expect(draftRender.onPublish).toHaveBeenCalledWith("live");

    cleanup();

    const publishedRender = renderToolbar("published", "live");
    fireEvent.click(screen.getAllByRole("button", { name: "Pause" })[0]!);
    expect(publishedRender.onPause).toHaveBeenCalledTimes(1);

    cleanup();

    const pausedRender = renderToolbar("paused", "live");
    fireEvent.click(screen.getAllByRole("button", { name: "Resume" })[0]!);
    expect(pausedRender.onResume).toHaveBeenCalledTimes(1);
  });

  test("wires mode switching", () => {
    const { onSetMode } = renderToolbar("published", "live");

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[0]!);
    expect(onSetMode).toHaveBeenCalledWith("test");
  });

  test("wires rename action", () => {
    const { onRename } = renderToolbar("published", "live");
    fireEvent.click(screen.getAllByRole("button", { name: /rename/i })[0]!);
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  test("renders publish overlap warnings inline", () => {
    renderToolbar("draft", "live", [
      'Potential overlap with "Journey A" on appointment.scheduled',
    ]);

    expect(screen.getAllByText("1 warning").length).toBeGreaterThan(0);
  });

  test("collapses to compact toolbar and exposes secondary actions in overflow menu", () => {
    renderToolbar("published", "live");

    mockToolbarOverflowDimensions({
      viewportWidth: 760,
      fullWidth: 1100,
      compactWidth: 640,
      minimalWidth: 260,
    });

    expect(screen.queryByRole("button", { name: /rename/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));

    expect(screen.getByText("Add step")).toBeTruthy();
    expect(screen.getByText("Rename journey")).toBeTruthy();
  });

  test("falls back to minimal toolbar and keeps core actions in overflow menu", () => {
    const { onSave, onSetMode } = renderToolbar("published", "live");

    mockToolbarOverflowDimensions({
      viewportWidth: 420,
      fullWidth: 1100,
      compactWidth: 640,
      minimalWidth: 240,
    });

    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Test" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));

    const saveChangesItem = screen.getByText("Save changes");
    expect(saveChangesItem.hasAttribute("data-disabled")).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(0);

    fireEvent.click(screen.getByText("Switch to Test"));
    expect(onSetMode).toHaveBeenCalledWith("test");
  });
});
