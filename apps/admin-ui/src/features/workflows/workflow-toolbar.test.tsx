import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { WorkflowToolbar } from "./workflow-toolbar";

afterEach(() => {
  cleanup();
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
  const onSetMode = mock((_mode: "live" | "test") => {});

  render(
    <ReactFlowProvider>
      <WorkflowToolbar
        canManageWorkflow={true}
        journeyStatus={journeyStatus}
        journeyMode={journeyMode}
        isPausing={false}
        isPublishing={false}
        isResuming={false}
        isSaving={false}
        isSettingMode={false}
        onPause={onPause}
        onPublish={onPublish}
        publishWarnings={publishWarnings}
        onResume={onResume}
        onSave={onSave}
        onSetMode={onSetMode}
      />
    </ReactFlowProvider>,
  );

  return {
    onSave,
    onPause,
    onPublish,
    onResume,
    onSetMode,
  };
}

describe("WorkflowToolbar", () => {
  test("shows publish controls for draft journeys", () => {
    renderToolbar("draft", "live");

    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Publish" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Live" })[0]).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Test" })[0]).toBeTruthy();
  });

  test("shows pause control for published journeys", () => {
    renderToolbar("published", "live");
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

  test("renders publish overlap warnings inline", () => {
    renderToolbar("draft", "live", [
      'Potential overlap with "Journey A" on appointment.scheduled',
    ]);

    expect(screen.getAllByText("Publish warnings").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        'Potential overlap with "Journey A" on appointment.scheduled',
      ).length,
    ).toBeGreaterThan(0);
  });
});
