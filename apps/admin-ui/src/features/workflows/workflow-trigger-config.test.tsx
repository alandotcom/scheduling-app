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

    expect(screen.getByText("Entry")).toBeTruthy();
    expect(screen.getByText("Re-entry")).toBeTruthy();
    expect(screen.getByText("Rescheduling")).toBeTruthy();
    expect(screen.getByText("Stop when")).toBeTruthy();
    expect(screen.getByText("Audience Rules")).toBeTruthy();

    const syncCheckbox = screen.getByRole("checkbox", {
      name: "Update scheduled messages when the appointment moves",
    });
    const exitCheckbox = screen.getByRole("checkbox", {
      name: "Appointment is canceled",
    });

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

  test("does not render advanced section details", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        config={createTriggerConfig()}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.queryByText("Event mapping (read-only):")).toBeNull();
    expect(screen.queryByText(/Journey key:/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Advanced" })).toBeNull();
  });

  test("keeps trigger filters collapsed by default and expands on toggle", () => {
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
            ],
          },
        }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.queryByRole("button", { name: "Add group" })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle audience rules" }),
    );

    expect(screen.getByRole("button", { name: "Add group" })).toBeTruthy();
  });

  test("adds blank condition rows with dropdown property and operator controls", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        config={createTriggerConfig()}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle audience rules" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add group" }));

    expect(
      screen.getByRole("combobox", {
        name: "Group 1 condition 1 field",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", {
        name: "Group 1 condition 1 operator",
      }),
    ).toBeTruthy();
    expect(screen.queryByDisplayValue("appointment.status")).toBeNull();
    expect(onUpdate).toHaveBeenCalledTimes(0);
  });

  test("shows appointment trigger attributes and timestamp-specific operators", () => {
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
                    field: "appointment.startAt",
                    operator: "within_next",
                    value: {
                      amount: 1,
                      unit: "days",
                    },
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

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle audience rules" }),
    );

    fireEvent.click(
      screen.getByRole("combobox", { name: "Group 1 condition 1 field" }),
    );
    expect(screen.getByText("Appointment Status")).toBeTruthy();
    expect(screen.queryByText("Patient Status")).toBeNull();

    fireEvent.click(
      screen.getByRole("combobox", { name: "Group 1 condition 1 operator" }),
    );
    expect(screen.getByText("is within the next")).toBeTruthy();
  });

  test("updates top-level filter logic through group connector controls", () => {
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
                    value: "confirmed",
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

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle audience rules" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Group connector OR" }));

    expect(onUpdate).toHaveBeenCalledWith({
      filter: {
        logic: "or",
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
                value: "confirmed",
              },
            ],
          },
        ],
      },
    });
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

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle audience rules" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add group" }));

    expect(screen.getByText("You can add at most 4 groups.")).toBeTruthy();
    expect(onUpdate).toHaveBeenCalledTimes(0);
  });

  test("allows removing the last group and clears all filters", () => {
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
            ],
          },
        }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle audience rules" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove group 1" }));

    expect(onUpdate).toHaveBeenCalledWith({ filter: undefined });
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

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle audience rules" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add condition" })[0]!,
    );

    expect(screen.getByText("You can add at most 12 conditions.")).toBeTruthy();
    expect(onUpdate).toHaveBeenCalledTimes(0);
  });
});
