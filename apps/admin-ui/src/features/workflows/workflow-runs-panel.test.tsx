import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WorkflowRunsPanelView } from "./workflow-runs-panel";

afterEach(() => {
  cleanup();
});

describe("WorkflowRunsPanelView", () => {
  test("supports test/live mode filters and mode badges", () => {
    const onSelectRun = mock((_runId: string | null) => {});

    render(
      <WorkflowRunsPanelView
        canManageWorkflow={true}
        isLoadingRunDetail={false}
        isLoadingRuns={false}
        onRefresh={() => {}}
        onSelectRun={onSelectRun}
        runs={[
          {
            id: "run-live",
            journeyVersionId: "version-live",
            appointmentId: "appointment-1",
            mode: "live",
            status: "completed",
            startedAt: new Date("2026-03-10T14:00:00.000Z"),
            completedAt: null,
            cancelledAt: null,
            journeyNameSnapshot: "Live Journey",
            journeyVersion: 1,
            journeyDeleted: false,
          },
          {
            id: "run-test",
            journeyVersionId: "version-test",
            appointmentId: "appointment-2",
            mode: "test",
            status: "completed",
            startedAt: new Date("2026-03-10T15:00:00.000Z"),
            completedAt: null,
            cancelledAt: null,
            journeyNameSnapshot: "Test Journey",
            journeyVersion: 1,
            journeyDeleted: false,
          },
        ]}
        selectedRunDetail={null}
        selectedRunId={null}
      />,
    );

    expect(screen.getByText("LIVE")).toBeTruthy();
    expect(screen.getByText("TEST")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    expect(screen.queryByText("Run for Live Journey")).toBeNull();
    expect(screen.getByText("Run for Test Journey")).toBeTruthy();
  });

  test("renders logger timeline entries and typed reason code labels", () => {
    render(
      <WorkflowRunsPanelView
        canManageWorkflow={true}
        isLoadingRunDetail={false}
        isLoadingRuns={false}
        onRefresh={() => {}}
        onSelectRun={() => {}}
        runs={[
          {
            id: "run-1",
            journeyVersionId: "version-1",
            appointmentId: "appointment-1",
            mode: "live",
            status: "completed",
            startedAt: new Date("2026-03-10T14:00:00.000Z"),
            completedAt: null,
            cancelledAt: null,
            journeyNameSnapshot: "Journey A",
            journeyVersion: 2,
            journeyDeleted: false,
          },
        ]}
        selectedRunDetail={{
          run: {
            id: "run-1",
            journeyVersionId: "version-1",
            appointmentId: "appointment-1",
            mode: "live",
            status: "completed",
            startedAt: new Date("2026-03-10T14:00:00.000Z"),
            completedAt: null,
            cancelledAt: null,
            journeyNameSnapshot: "Journey A",
            journeyVersion: 2,
            journeyDeleted: false,
          },
          runSnapshot: {
            version: 2,
          },
          deliveries: [
            {
              id: "delivery-logger",
              journeyRunId: "run-1",
              stepKey: "logger-step",
              channel: "logger",
              scheduledFor: new Date("2026-03-10T14:01:00.000Z"),
              status: "sent",
              reasonCode: null,
              createdAt: new Date("2026-03-10T14:01:00.000Z"),
              updatedAt: new Date("2026-03-10T14:01:00.000Z"),
            },
            {
              id: "delivery-send",
              journeyRunId: "run-1",
              stepKey: "send-step",
              channel: "email",
              scheduledFor: new Date("2026-03-10T14:02:00.000Z"),
              status: "skipped",
              reasonCode: "past_due",
              createdAt: new Date("2026-03-10T14:02:00.000Z"),
              updatedAt: new Date("2026-03-10T14:02:00.000Z"),
            },
          ],
        }}
        selectedRunId="run-1"
      />,
    );

    expect(screen.getByText("Logger entry")).toBeTruthy();
    expect(screen.getByText("Past due")).toBeTruthy();
  });

  test("uses snapshot labels when journey definition was deleted", () => {
    render(
      <WorkflowRunsPanelView
        canManageWorkflow={false}
        isLoadingRunDetail={false}
        isLoadingRuns={false}
        onRefresh={() => {}}
        onSelectRun={() => {}}
        runs={[
          {
            id: "run-deleted",
            journeyVersionId: null,
            appointmentId: "appointment-3",
            mode: "test",
            status: "canceled",
            startedAt: new Date("2026-03-10T14:00:00.000Z"),
            completedAt: null,
            cancelledAt: new Date("2026-03-10T14:10:00.000Z"),
            journeyNameSnapshot: "Archived Journey",
            journeyVersion: 7,
            journeyDeleted: true,
          },
        ]}
        selectedRunDetail={null}
        selectedRunId={null}
      />,
    );

    expect(screen.getByText("Run for Archived Journey")).toBeTruthy();
    expect(screen.getByText(/Version 7.*Deleted journey/)).toBeTruthy();
  });
});
