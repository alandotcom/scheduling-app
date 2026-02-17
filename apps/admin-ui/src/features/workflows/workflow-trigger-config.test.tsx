import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WorkflowTriggerConfig } from "./workflow-trigger-config";

afterEach(() => {
  cleanup();
});

function createTriggerConfig() {
  return {
    triggerType: "AppointmentJourney",
    start: "appointment.scheduled",
    restart: "appointment.rescheduled",
    stop: "appointment.canceled",
    correlationKey: "appointmentId",
  } as const;
}

describe("WorkflowTriggerConfig", () => {
  test("renders canonical appointment journey sections with locked controls", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        config={createTriggerConfig()}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByText("Start condition")).toBeTruthy();
    expect(
      screen.getByText("If already running for this appointment"),
    ).toBeTruthy();
    expect(screen.getByText("Keep in sync (recommended)")).toBeTruthy();
    expect(screen.getByText("Exit condition")).toBeTruthy();

    const keepRunning = screen.getByRole("radio", { name: /Keep running/i });
    const startOver = screen.getByRole("radio", { name: /Start over/i });
    const syncCheckbox = screen.getByRole("checkbox", {
      name: "When appointment is rescheduled",
    });
    const exitCheckbox = screen.getByRole("checkbox", {
      name: "Appointment canceled",
    });

    expect((keepRunning as HTMLInputElement).checked).toBe(true);
    expect((keepRunning as HTMLInputElement).disabled).toBe(true);
    expect((startOver as HTMLInputElement).disabled).toBe(true);
    expect((syncCheckbox as HTMLInputElement).checked).toBe(true);
    expect((syncCheckbox as HTMLInputElement).disabled).toBe(true);
    expect((exitCheckbox as HTMLInputElement).checked).toBe(true);
    expect((exitCheckbox as HTMLInputElement).disabled).toBe(true);

    expect(screen.queryByLabelText("Domain")).toBeNull();
    expect(screen.queryByLabelText("Start events")).toBeNull();
    expect(screen.queryByLabelText("Restart events")).toBeNull();
    expect(screen.queryByLabelText("Stop events")).toBeNull();
    expect(screen.queryByLabelText("Correlation path")).toBeNull();
  });

  test("renders advanced details behind collapsible section", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        config={createTriggerConfig()}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.queryByText("Event mapping (internal):")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));

    expect(screen.getByText("Event mapping (internal):")).toBeTruthy();
    expect(screen.getByText("appointment.scheduled")).toBeTruthy();
    expect(screen.getByText("appointment.rescheduled")).toBeTruthy();
    expect(screen.getByText("appointment.canceled")).toBeTruthy();
    expect(screen.getByText(/Appointment ID \(read-only in v1\)/)).toBeTruthy();
  });

  test("keeps trigger filters collapsed by default and edits grouped AST when expanded", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        config={createTriggerConfig()}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.queryByRole("button", { name: "Add group" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show filters" }));

    fireEvent.click(screen.getByRole("button", { name: "Add group" }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add condition" })[0]!,
    );

    const fieldInput = screen.getAllByPlaceholderText(
      "appointment.startAt",
    )[0]!;
    fireEvent.change(fieldInput, {
      target: { value: "appointment.startAt" },
    });

    expect(onUpdate).toHaveBeenCalled();
  });

  test("prevents adding more than four filter groups", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        config={{
          ...createTriggerConfig(),
          filter: {
            logic: "and",
            groups: [
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
            ],
          },
        }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Add group" }));

    expect(screen.getByText("You can add at most 4 groups.")).toBeTruthy();
    expect(onUpdate).toHaveBeenCalledTimes(0);
  });

  test("prevents adding more than twelve filter conditions", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        config={{
          ...createTriggerConfig(),
          filter: {
            logic: "and",
            groups: [
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
              {
                logic: "and",
                conditions: [
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                  {
                    field: "appointment.status",
                    operator: "equals",
                    value: "scheduled",
                  },
                ],
              },
            ],
          },
        }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show filters" }));
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add condition" })[0]!,
    );

    expect(screen.getByText("You can add at most 12 conditions.")).toBeTruthy();
    expect(onUpdate).toHaveBeenCalledTimes(0);
  });
});
