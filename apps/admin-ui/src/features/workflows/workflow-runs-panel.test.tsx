import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WorkflowRunsPanelView } from "./workflow-runs-panel";

afterEach(() => {
  cleanup();
});

describe("WorkflowRunsPanelView", () => {
  test("supports test/live mode filters in list view", () => {
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

    // List view shows journey names and mode as lowercase text
    expect(screen.getByText("Live Journey")).toBeTruthy();
    expect(screen.getByText("Test Journey")).toBeTruthy();

    // Filter to test mode only
    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    expect(screen.queryByText("Live Journey")).toBeNull();
    expect(screen.getByText("Test Journey")).toBeTruthy();
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
          events: [],
          stepLogs: [],
          triggerContext: null,
        }}
        selectedRunId="run-1"
      />,
    );

    expect(screen.getByText("Logger entry")).toBeTruthy();
    expect(
      screen.getByText("Skipped because scheduled time already passed"),
    ).toBeTruthy();
  });

  test("hides raw audit events by default and reveals them in advanced mode", () => {
    render(
      <WorkflowRunsPanelView
        canManageWorkflow={true}
        isLoadingRunDetail={false}
        isLoadingRuns={false}
        onRefresh={() => {}}
        onSelectRun={() => {}}
        runs={[
          {
            id: "run-audit",
            journeyVersionId: "version-audit",
            appointmentId: "appointment-9",
            mode: "live",
            status: "running",
            startedAt: new Date("2026-03-10T14:00:00.000Z"),
            completedAt: null,
            cancelledAt: null,
            journeyNameSnapshot: "Journey Audit",
            journeyVersion: 2,
            journeyDeleted: false,
          },
        ]}
        selectedRunDetail={{
          run: {
            id: "run-audit",
            journeyVersionId: "version-audit",
            appointmentId: "appointment-9",
            mode: "live",
            status: "running",
            startedAt: new Date("2026-03-10T14:00:00.000Z"),
            completedAt: null,
            cancelledAt: null,
            journeyNameSnapshot: "Journey Audit",
            journeyVersion: 2,
            journeyDeleted: false,
          },
          runSnapshot: {
            version: 2,
          },
          deliveries: [],
          events: [
            {
              id: "event-1",
              journeyRunId: "run-audit",
              eventType: "run_waiting",
              message: "Run waiting in delay node 'Wait'",
              metadata: null,
              createdAt: new Date("2026-03-10T14:00:01.000Z"),
            },
          ],
          stepLogs: [
            {
              id: "step-1",
              journeyRunId: "run-audit",
              stepKey: "wait-step",
              nodeType: "wait",
              status: "running",
              input: null,
              output: {
                waitUntil: "2026-03-10T14:05:00.000Z",
              },
              error: null,
              startedAt: new Date("2026-03-10T14:00:01.000Z"),
              completedAt: null,
              durationMs: null,
              createdAt: new Date("2026-03-10T14:00:01.000Z"),
              updatedAt: new Date("2026-03-10T14:00:01.000Z"),
            },
          ],
          triggerContext: null,
        }}
        selectedRunId="run-audit"
      />,
    );

    // Technical details (run events) hidden by default
    expect(screen.queryByText("Run waiting in delay node 'Wait'")).toBeNull();

    // Click "Show technical details" text button to reveal
    fireEvent.click(
      screen.getByRole("button", { name: "Show technical details" }),
    );
    expect(screen.getByText("Run waiting in delay node 'Wait'")).toBeTruthy();
  });

  test("shows timeline step labels and supports node selection in run mode", () => {
    const onSelectNode = mock((_nodeId: string | null) => {});

    render(
      <WorkflowRunsPanelView
        canManageWorkflow={true}
        isLoadingRunDetail={false}
        isLoadingRuns={false}
        onRefresh={() => {}}
        onSelectNode={onSelectNode}
        onSelectRun={() => {}}
        runs={[
          {
            id: "run-context",
            journeyVersionId: "version-context",
            appointmentId: "appointment-context",
            mode: "live",
            status: "running",
            startedAt: new Date("2026-03-10T14:00:00.000Z"),
            completedAt: null,
            cancelledAt: null,
            journeyNameSnapshot: "Journey Context",
            journeyVersion: 2,
            journeyDeleted: false,
          },
        ]}
        selectedNodeId="trigger-step"
        selectedRunDetail={{
          run: {
            id: "run-context",
            journeyVersionId: "version-context",
            appointmentId: "appointment-context",
            mode: "live",
            status: "running",
            startedAt: new Date("2026-03-10T14:00:00.000Z"),
            completedAt: null,
            cancelledAt: null,
            journeyNameSnapshot: "Journey Context",
            journeyVersion: 2,
            journeyDeleted: false,
          },
          runSnapshot: {
            version: 2,
            definitionSnapshot: {
              attributes: {},
              options: { type: "directed" },
              nodes: [
                {
                  key: "trigger-step",
                  attributes: {
                    id: "trigger-step",
                    data: {
                      type: "trigger",
                      label: "",
                      config: {},
                    },
                  },
                },
                {
                  key: "wait-step",
                  attributes: {
                    id: "wait-step",
                    data: {
                      type: "action",
                      label: "Wait",
                      config: { actionType: "wait" },
                    },
                  },
                },
              ],
              edges: [],
            },
          },
          deliveries: [],
          events: [],
          stepLogs: [
            {
              id: "step-trigger",
              journeyRunId: "run-context",
              stepKey: "trigger-step",
              nodeType: "trigger",
              status: "success",
              input: null,
              output: null,
              error: null,
              startedAt: new Date("2026-03-10T14:00:00.000Z"),
              completedAt: new Date("2026-03-10T14:00:00.000Z"),
              durationMs: 0,
              createdAt: new Date("2026-03-10T14:00:00.000Z"),
              updatedAt: new Date("2026-03-10T14:00:00.000Z"),
            },
            {
              id: "step-context",
              journeyRunId: "run-context",
              stepKey: "wait-step",
              nodeType: "wait",
              status: "running",
              input: {
                waitTimezone: "America/New_York",
              },
              output: {
                waitUntil: "2026-03-10T14:05:00.000Z",
              },
              error: null,
              startedAt: new Date("2026-03-10T14:00:01.000Z"),
              completedAt: null,
              durationMs: null,
              createdAt: new Date("2026-03-10T14:00:01.000Z"),
              updatedAt: new Date("2026-03-10T14:00:01.000Z"),
            },
          ],
          triggerContext: {
            eventType: "appointment.scheduled",
            appointment: {
              id: "appointment-context",
              calendarId: "calendar-context",
              appointmentTypeId: "type-context",
              clientId: "client-context",
              startAt: new Date("2026-03-10T14:00:00.000Z"),
              endAt: new Date("2026-03-10T14:30:00.000Z"),
              timezone: "America/New_York",
              status: "scheduled",
              notes: null,
            },
            client: {
              id: "client-context",
              firstName: "Ada",
              lastName: "Lovelace",
              email: "ada@example.com",
              phone: null,
            },
            payload: {
              eventType: "appointment.scheduled",
              appointmentId: "appointment-context",
            },
          },
        }}
        selectedRunId="run-context"
      />,
    );

    // Trigger step appears in timeline
    expect(screen.getByText("Trigger")).toBeTruthy();

    // Wait step label appears in timeline
    expect(screen.getByText("Wait")).toBeTruthy();

    // Click on Wait step triggers node selection
    fireEvent.click(screen.getByText("Wait").closest("button")!);
    expect(onSelectNode).toHaveBeenCalledWith("wait-step");
  });

  test("treats stale running wait steps as completed for terminal runs", () => {
    render(
      <WorkflowRunsPanelView
        canManageWorkflow={true}
        isLoadingRunDetail={false}
        isLoadingRuns={false}
        onRefresh={() => {}}
        onSelectRun={() => {}}
        runs={[
          {
            id: "run-terminal",
            journeyVersionId: "version-terminal",
            appointmentId: "appointment-terminal",
            mode: "live",
            status: "completed",
            startedAt: new Date("2026-03-10T14:00:00.000Z"),
            completedAt: new Date("2026-03-10T14:05:00.000Z"),
            cancelledAt: null,
            journeyNameSnapshot: "Journey Terminal",
            journeyVersion: 2,
            journeyDeleted: false,
          },
        ]}
        selectedRunDetail={{
          run: {
            id: "run-terminal",
            journeyVersionId: "version-terminal",
            appointmentId: "appointment-terminal",
            mode: "live",
            status: "completed",
            startedAt: new Date("2026-03-10T14:00:00.000Z"),
            completedAt: new Date("2026-03-10T14:05:00.000Z"),
            cancelledAt: null,
            journeyNameSnapshot: "Journey Terminal",
            journeyVersion: 2,
            journeyDeleted: false,
          },
          runSnapshot: {
            version: 2,
          },
          deliveries: [],
          events: [],
          stepLogs: [
            {
              id: "step-wait",
              journeyRunId: "run-terminal",
              stepKey: "wait-step",
              nodeType: "wait",
              status: "running",
              input: null,
              output: {
                waitUntil: "2026-03-10T14:05:00.000Z",
              },
              error: null,
              startedAt: new Date("2026-03-10T14:00:00.000Z"),
              completedAt: null,
              durationMs: null,
              createdAt: new Date("2026-03-10T14:00:00.000Z"),
              updatedAt: new Date("2026-03-10T14:05:00.000Z"),
            },
          ],
          triggerContext: null,
        }}
        selectedRunId="run-terminal"
      />,
    );

    expect(screen.queryByText(/Waiting until/i)).toBeNull();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
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

    // List view shows journey name and version/deleted metadata
    expect(screen.getByText("Archived Journey")).toBeTruthy();
    expect(screen.getByText(/v7.*deleted/)).toBeTruthy();
  });

  test("shows run-level and journey-level cancel actions with explicit scope", () => {
    const onCancelRun = mock((_runId: string) => {});
    const onCancelJourneyRuns = mock(() => {});

    render(
      <WorkflowRunsPanelView
        canManageWorkflow={true}
        isLoadingRunDetail={false}
        isLoadingRuns={false}
        onRefresh={() => {}}
        onSelectRun={() => {}}
        onCancelJourneyRuns={onCancelJourneyRuns}
        onCancelRun={onCancelRun}
        runs={[
          {
            id: "run-active",
            journeyVersionId: "version-active",
            appointmentId: "appointment-4",
            mode: "live",
            status: "running",
            startedAt: new Date("2026-03-10T14:00:00.000Z"),
            completedAt: null,
            cancelledAt: null,
            journeyNameSnapshot: "Journey Cancel Scope",
            journeyVersion: 3,
            journeyDeleted: false,
          },
        ]}
        selectedRunDetail={{
          run: {
            id: "run-active",
            journeyVersionId: "version-active",
            appointmentId: "appointment-4",
            mode: "live",
            status: "running",
            startedAt: new Date("2026-03-10T14:00:00.000Z"),
            completedAt: null,
            cancelledAt: null,
            journeyNameSnapshot: "Journey Cancel Scope",
            journeyVersion: 3,
            journeyDeleted: false,
          },
          runSnapshot: {
            version: 3,
          },
          deliveries: [],
          events: [],
          stepLogs: [],
          triggerContext: null,
        }}
        selectedRunId="run-active"
      />,
    );

    // Cancel buttons visible directly in detail view for active runs
    fireEvent.click(screen.getByRole("button", { name: "Cancel this run" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Cancel all active runs for this journey",
      }),
    );

    expect(onCancelRun).toHaveBeenCalledWith("run-active");
    expect(onCancelJourneyRuns).toHaveBeenCalledTimes(1);
  });

  test("renders selected run status from run detail when list row is stale", () => {
    render(
      <WorkflowRunsPanelView
        canManageWorkflow={true}
        isLoadingRunDetail={false}
        isLoadingRuns={false}
        onRefresh={() => {}}
        onSelectRun={() => {}}
        runs={[
          {
            id: "run-stale",
            journeyVersionId: "version-stale",
            appointmentId: "appointment-5",
            mode: "live",
            status: "planned",
            startedAt: new Date("2026-03-10T14:00:00.000Z"),
            completedAt: null,
            cancelledAt: null,
            journeyNameSnapshot: "Journey Stale",
            journeyVersion: 4,
            journeyDeleted: false,
          },
        ]}
        selectedRunDetail={{
          run: {
            id: "run-stale",
            journeyVersionId: "version-stale",
            appointmentId: "appointment-5",
            mode: "live",
            status: "completed",
            startedAt: new Date("2026-03-10T14:00:00.000Z"),
            completedAt: new Date("2026-03-10T14:05:00.000Z"),
            cancelledAt: null,
            journeyNameSnapshot: "Journey Stale",
            journeyVersion: 4,
            journeyDeleted: false,
          },
          runSnapshot: {
            version: 4,
          },
          deliveries: [],
          events: [],
          stepLogs: [],
          triggerContext: null,
        }}
        selectedRunId="run-stale"
      />,
    );

    // Detail view uses status from runDetail (completed), not from stale list row (planned)
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Cancel this run" }),
    ).toBeNull();
  });
});
