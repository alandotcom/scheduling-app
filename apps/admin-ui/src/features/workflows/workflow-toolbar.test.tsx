import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { WorkflowToolbar } from "./workflow-toolbar";

afterEach(() => {
  cleanup();
});

function renderToolbar(
  journeyState: "draft" | "published" | "paused" | "test_only",
  publishWarnings: string[] = [],
) {
  const onSave = mock(() => {});
  const onPause = mock(() => {});
  const onPublish = mock((_mode: "live" | "test") => {});
  const onResume = mock((_target: "published" | "test_only") => {});

  render(
    <ReactFlowProvider>
      <WorkflowToolbar
        canManageWorkflow={true}
        journeyState={journeyState}
        isPausing={false}
        isPublishing={false}
        isResuming={false}
        isSaving={false}
        onPause={onPause}
        onPublish={onPublish}
        publishWarnings={publishWarnings}
        onResume={onResume}
        onSave={onSave}
      />
    </ReactFlowProvider>,
  );

  return {
    onSave,
    onPause,
    onPublish,
    onResume,
  };
}

describe("WorkflowToolbar", () => {
  test("shows publish controls for draft journeys", () => {
    renderToolbar("draft");

    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Publish" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Publish test-only" })[0],
    ).toBeTruthy();
  });

  test("shows pause control for published journeys", () => {
    renderToolbar("published");
    expect(
      screen.getAllByRole("button", { name: "Pause" }).length,
    ).toBeGreaterThan(0);
  });

  test("shows resume controls for paused journeys", () => {
    renderToolbar("paused");

    expect(
      screen.getAllByRole("button", { name: "Resume live" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Resume test-only" })[0],
    ).toBeTruthy();
  });

  test("wires publish and pause actions", () => {
    const { onPublish } = renderToolbar("draft");

    fireEvent.click(screen.getAllByRole("button", { name: "Publish" })[0]!);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Publish test-only" })[0]!,
    );

    expect(onPublish).toHaveBeenCalledWith("live");
    expect(onPublish).toHaveBeenCalledWith("test");

    cleanup();

    const pausedRender = renderToolbar("published");
    fireEvent.click(screen.getAllByRole("button", { name: "Pause" })[0]!);
    expect(pausedRender.onPause).toHaveBeenCalledTimes(1);
  });

  test("renders publish overlap warnings inline", () => {
    renderToolbar("draft", [
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
