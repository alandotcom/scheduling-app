import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { getWorkflowFilterFieldOptions } from "./filter-builder-shared";
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

function createClientUpdatedTriggerConfig() {
  return {
    triggerType: "ClientJourney",
    event: "client.updated",
    correlationKey: "clientId",
    trackedAttributeKey: "renewalDate",
  } as const;
}

function createClientCreatedTriggerConfig() {
  return {
    triggerType: "ClientJourney",
    event: "client.created",
    correlationKey: "clientId",
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

    expect(screen.getByText("Scheduled starts run")).toBeTruthy();
    expect(screen.getByText("Rescheduled replans run")).toBeTruthy();
    expect(screen.getByText("Canceled stops run")).toBeTruthy();
    expect(screen.getByText("No Show stops run")).toBeTruthy();
    expect(
      screen.getByText(
        "Rescheduled appointments replan the same run and shift future waits and sends to the new start time.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Cancellation prevents future messages from sending."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "No-show events follow the same terminal behavior as cancel.",
      ),
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

  test("locks trigger type selection when trigger type is locked", () => {
    const onUpdate = mock(() => {});
    const onTriggerTypeChange = mock(
      (_triggerType: "AppointmentJourney" | "ClientJourney") => {},
    );

    render(
      <WorkflowTriggerConfig
        config={createTriggerConfig()}
        disabled={false}
        onTriggerTypeChange={onTriggerTypeChange}
        onUpdate={onUpdate}
        triggerTypeLocked
      />,
    );

    const appointmentButton = screen.getByRole("button", {
      name: "Appointment",
    }) as HTMLButtonElement;
    const clientButton = screen.getByRole("button", {
      name: "Client",
    }) as HTMLButtonElement;

    expect(appointmentButton.disabled).toBe(true);
    expect(clientButton.disabled).toBe(true);
    expect(
      screen.getByText(
        "Trigger type is locked once the workflow includes additional steps.",
      ),
    ).toBeTruthy();

    fireEvent.click(clientButton);
    expect(onTriggerTypeChange).toHaveBeenCalledTimes(0);
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

  test("uses lookup dropdown values for ID-backed fields", () => {
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
                    field: "appointment.calendarId",
                    operator: "equals",
                    value: "cal-123",
                  },
                ],
              },
            ],
          },
        }}
        disabled={false}
        onUpdate={onUpdate}
        valueOptionsByField={{
          "appointment.calendarId": [
            {
              value: "cal-123",
              label: "Main Calendar — cal-123",
            },
          ],
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle audience rules" }),
    );

    const valueCombobox = screen.getByRole("combobox", {
      name: "Group 1 condition 1 value",
    });
    expect(valueCombobox.textContent).toContain("Main Calendar — cal-123");
    expect(screen.queryByPlaceholderText("Enter value...")).toBeNull();
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

  test("keeps value input focused while typing when filter updates are controlled", () => {
    function ControlledWorkflowTriggerConfig() {
      const [config, setConfig] = useState<Record<string, unknown>>({
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
                  value: "a",
                },
              ],
            },
          ],
        },
      });

      return (
        <WorkflowTriggerConfig
          config={config}
          disabled={false}
          onUpdate={(next) =>
            setConfig((current) => ({
              ...current,
              ...next,
            }))
          }
        />
      );
    }

    render(<ControlledWorkflowTriggerConfig />);

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle audience rules" }),
    );

    const input = screen.getByDisplayValue("a") as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "ab" } });
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("ab");

    fireEvent.change(input, { target: { value: "abc" } });
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("abc");
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
    expect(screen.queryByText("Appointment ID")).toBeNull();
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

  test("limits ID field operators to equals and contains with multi-select input", () => {
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
                    field: "appointment.calendarId",
                    operator: "in",
                    value: ["cal-123"],
                  },
                ],
              },
            ],
          },
        }}
        disabled={false}
        onUpdate={onUpdate}
        valueOptionsByField={{
          "appointment.calendarId": [
            {
              value: "cal-123",
              label: "Main Calendar — cal-123",
            },
          ],
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle audience rules" }),
    );

    const operatorCombobox = screen.getByRole("combobox", {
      name: "Group 1 condition 1 operator",
    });
    expect(operatorCombobox.textContent).toContain("contains");
    expect(operatorCombobox.textContent?.trim()).not.toBe("in");

    fireEvent.click(operatorCombobox);
    expect(screen.getAllByText("equals").length).toBeGreaterThan(0);
    expect(screen.getAllByText("contains").length).toBeGreaterThan(0);
    expect(screen.queryByText("does not equal")).toBeNull();

    expect(screen.getByText("Main Calendar — cal-123")).toBeTruthy();
  });

  test("uses true/false/set operator choices for boolean fields", () => {
    const onUpdate = mock(() => {});
    const fieldOptions = getWorkflowFilterFieldOptions([
      {
        fieldKey: "newsletterOptIn",
        label: "Newsletter Opt-In",
        type: "BOOLEAN",
      },
    ]);

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
                    field: "client.customAttributes.newsletterOptIn",
                    operator: "equals",
                    value: true,
                  },
                ],
              },
            ],
          },
        }}
        disabled={false}
        fieldOptions={fieldOptions}
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle audience rules" }),
    );

    const operatorCombobox = screen.getByRole("combobox", {
      name: "Group 1 condition 1 operator",
    });
    expect(operatorCombobox.textContent).toContain("is true");
    expect(screen.queryByPlaceholderText("Enter value...")).toBeNull();

    fireEvent.click(operatorCombobox);
    expect(screen.getAllByText("is true").length).toBeGreaterThan(0);
    expect(screen.getAllByText("is false").length).toBeGreaterThan(0);
    expect(screen.getAllByText("is set").length).toBeGreaterThan(0);
    expect(screen.getAllByText("is not set").length).toBeGreaterThan(0);
    expect(screen.queryByText("contains")).toBeNull();
    expect(screen.queryByText("equals")).toBeNull();
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

  test("renders tracked attribute selector for client.updated trigger", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        clientAttributeDefinitions={[
          {
            fieldKey: "renewalDate",
            label: "Renewal Date",
            type: "DATE",
          },
        ]}
        config={createClientUpdatedTriggerConfig()}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    const trackedAttributeCombobox = screen.getByRole("combobox", {
      name: "Tracked attribute key",
    });
    expect(trackedAttributeCombobox.textContent).toContain("Renewal Date");
  });

  test("renders human label for client.created event select value", () => {
    const onUpdate = mock(() => {});

    const view = render(
      <WorkflowTriggerConfig
        config={createClientCreatedTriggerConfig()}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    const eventCombobox = view.container.querySelector(
      "button[role='combobox']",
    );
    expect(eventCombobox).toBeTruthy();
    expect(eventCombobox?.textContent).toContain("Client Created");
    expect(eventCombobox?.textContent).not.toContain("client.created");
  });

  test("renders human label for client.updated event select value", () => {
    const onUpdate = mock(() => {});

    const view = render(
      <WorkflowTriggerConfig
        clientAttributeDefinitions={[
          {
            fieldKey: "renewalDate",
            label: "Renewal Date",
            type: "DATE",
          },
        ]}
        config={createClientUpdatedTriggerConfig()}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    const eventCombobox = view.container.querySelector(
      "button[role='combobox']",
    );
    expect(eventCombobox).toBeTruthy();
    expect(eventCombobox?.textContent).toContain("Client Updated");
    expect(eventCombobox?.textContent).not.toContain("client.updated");
  });

  test("explains what tracked attributes do for client.updated triggers", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        clientAttributeDefinitions={[]}
        config={createClientUpdatedTriggerConfig()}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    expect(
      screen.getByText(
        "A tracked attribute is the specific client field this trigger watches. The journey runs only when that field changes, including built-in fields like name/email/phone or custom attributes.",
      ),
    ).toBeTruthy();
  });

  test("falls back to a built-in tracked attribute when client.updated has no matching custom selection", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        clientAttributeDefinitions={[]}
        config={createClientUpdatedTriggerConfig()}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    expect(onUpdate).toHaveBeenCalledWith({
      triggerType: "ClientJourney",
      event: "client.updated",
      correlationKey: "clientId",
      trackedAttributeKey: "client.id",
    });
  });

  test("keeps built-in tracked attributes valid without custom definitions", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        clientAttributeDefinitions={[]}
        config={{
          triggerType: "ClientJourney",
          event: "client.updated",
          correlationKey: "clientId",
          trackedAttributeKey: "client.email",
        }}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    expect(onUpdate).toHaveBeenCalledTimes(0);
  });

  test("clears stale tracked attribute selections that no longer exist", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        clientAttributeDefinitions={[
          {
            fieldKey: "membershipTier",
            label: "Membership Tier",
            type: "TEXT",
          },
        ]}
        config={createClientUpdatedTriggerConfig()}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    expect(
      screen.getByText(
        "The previously selected attribute no longer exists. Select a new tracked attribute.",
      ),
    ).toBeTruthy();
    expect(onUpdate).toHaveBeenCalledWith({
      triggerType: "ClientJourney",
      event: "client.updated",
      correlationKey: "clientId",
      trackedAttributeKey: "membershipTier",
    });
  });

  test("does not clear tracked attribute selections while definitions are still loading", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        clientAttributeDefinitions={[]}
        clientAttributeDefinitionsLoaded={false}
        config={createClientUpdatedTriggerConfig()}
        disabled={false}
        onUpdate={onUpdate}
      />,
    );

    expect(
      screen.queryByText(
        "The previously selected attribute no longer exists. Select a new tracked attribute.",
      ),
    ).toBeNull();
    expect(onUpdate).toHaveBeenCalledTimes(0);
  });

  test("does not clear stale tracked attribute selections when trigger config is disabled", () => {
    const onUpdate = mock(() => {});

    render(
      <WorkflowTriggerConfig
        clientAttributeDefinitions={[
          {
            fieldKey: "membershipTier",
            label: "Membership Tier",
            type: "TEXT",
          },
        ]}
        config={createClientUpdatedTriggerConfig()}
        disabled
        onUpdate={onUpdate}
      />,
    );

    expect(
      screen.getByText(
        "The previously selected attribute no longer exists. Select a new tracked attribute.",
      ),
    ).toBeTruthy();
    expect(onUpdate).toHaveBeenCalledTimes(0);
  });
});
