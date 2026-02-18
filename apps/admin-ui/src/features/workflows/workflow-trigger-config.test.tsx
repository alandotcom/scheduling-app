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
  test("renders compact appointment journey summary", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        config={createTriggerConfig()}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    expect(
      screen.getByText(
        "Starts on Scheduled - Updates on Rescheduled - Stops on Canceled.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Rescheduling updates future waits and sends to the new start time.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Cancellation prevents future messages from sending."),
    ).toBeTruthy();
    expect(screen.getByText("Audience Rules")).toBeTruthy();

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

  test("keeps audience rules expanded after valid filter selections", () => {
    const onUpdate = mock(() => {});
    const view = render(
      <WorkflowTriggerConfig
        config={createTriggerConfig()}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle audience rules" }),
    );

    view.rerender(
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
                    operator: "is_set",
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

    expect(screen.getByRole("button", { name: "Add group" })).toBeTruthy();
  });

  test("shows appointment and client trigger attributes plus timestamp-specific operators", () => {
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
    expect(screen.getByText("Client First Name")).toBeTruthy();
    expect(screen.getByText("Client Last Name")).toBeTruthy();
    expect(screen.getByText("Client Email")).toBeTruthy();
    expect(screen.getByText("Client Phone")).toBeTruthy();
    expect(screen.queryByText("Patient Status")).toBeNull();

    const fieldCombobox = screen.getByRole("combobox", {
      name: "Group 1 condition 1 field",
    });
    expect(fieldCombobox.textContent).toContain("Start Time");
    expect(fieldCombobox.textContent).not.toContain("appointment.startAt");

    const operatorCombobox = screen.getByRole("combobox", {
      name: "Group 1 condition 1 operator",
    });
    expect(operatorCombobox.textContent).toContain("is within the next");
    expect(operatorCombobox.textContent).not.toContain("within_next");

    fireEvent.click(operatorCombobox);
    expect(screen.getAllByText("is within the next").length).toBeGreaterThan(0);
  });

  test("moves ago phrasing into the unit selector for past-relative operators", () => {
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
                    operator: "more_than_ago",
                    value: {
                      amount: 3,
                      unit: "hours",
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

    const operatorCombobox = screen.getByRole("combobox", {
      name: "Group 1 condition 1 operator",
    });
    expect(operatorCombobox.textContent).toContain("is more than");
    expect(operatorCombobox.textContent).not.toContain("ago");

    const unitCombobox = screen.getByRole("combobox", {
      name: "Group 1 condition 1 unit",
    });
    expect(unitCombobox.textContent).toContain("hours ago");

    fireEvent.click(unitCombobox);
    expect(screen.getAllByText("minutes ago").length).toBeGreaterThan(0);
    expect(screen.getAllByText("hours ago").length).toBeGreaterThan(0);
    expect(screen.getAllByText("days ago").length).toBeGreaterThan(0);
    expect(screen.getAllByText("weeks ago").length).toBeGreaterThan(0);
  });

  test("renders datetime-local input for absolute temporal operators", () => {
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
                    operator: "before",
                    value: "2026-02-16",
                  },
                ],
              },
            ],
          },
        }}
        defaultTimezone="America/Chicago"
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle audience rules" }),
    );

    const input = screen.getByDisplayValue(
      "2026-02-16T00:00",
    ) as HTMLInputElement;
    expect(input.type).toBe("datetime-local");
    const timezoneCombobox = screen.getByRole("combobox", {
      name: "Group 1 condition 1 timezone",
    });
    expect(timezoneCombobox.textContent).toContain("America/Chicago");
  });

  test("keeps existing absolute temporal filter datetimes without truncation", () => {
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
                    operator: "before",
                    value: "2026-02-16T09:30",
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

    const input = screen.getByDisplayValue("2026-02-16T09:30");
    expect((input as HTMLInputElement).type).toBe("datetime-local");
  });

  test("shows selected explicit timezone for absolute temporal filters", () => {
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
                    operator: "before",
                    value: "2026-02-16T09:30",
                    timezone: "America/Los_Angeles",
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
    const timezoneCombobox = screen.getByRole("combobox", {
      name: "Group 1 condition 1 timezone",
    });
    expect(timezoneCombobox.textContent).toContain("America/Los Angeles");
  });

  test("shows fallback label for operators incompatible with the selected field", () => {
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
                    operator: "on_or_before",
                    value: "2026-01-01T00:00:00Z",
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

    const operatorCombobox = screen.getByRole("combobox", {
      name: "Group 1 condition 1 operator",
    });
    expect(operatorCombobox.textContent).toContain("on or before");
    expect(operatorCombobox.textContent).not.toContain("on_or_before");
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
