import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ActionConfig } from "./action-config";

afterEach(() => {
  cleanup();
});

function StatefulActionConfig({
  initialConfig,
}: {
  initialConfig: Record<string, unknown>;
}) {
  const [config, setConfig] = useState(initialConfig);

  return (
    <ActionConfig
      config={config}
      onUpdateConfig={(key, value) =>
        setConfig((currentConfig) => ({
          ...currentConfig,
          [key]: value,
        }))
      }
      onUpdateConfigBatch={(patch) =>
        setConfig((currentConfig) => ({
          ...currentConfig,
          ...patch,
        }))
      }
    />
  );
}

describe("ActionConfig", () => {
  test("shows brand logos in service and action pickers", () => {
    render(
      <ActionConfig
        config={{ actionType: "send-slack" }}
        onUpdateConfig={mock((_key: string, _value: unknown) => {})}
      />,
    );

    const comboboxes = screen.getAllByRole("combobox");
    const serviceTrigger = comboboxes[0];
    const actionTrigger = comboboxes[1];
    if (!(serviceTrigger && actionTrigger)) {
      throw new Error("Expected service and action comboboxes");
    }

    fireEvent.click(serviceTrigger);
    expect(
      screen.getByTestId("action-config-category-logo-slack"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("action-config-category-logo-resend"),
    ).toBeTruthy();

    fireEvent.click(actionTrigger);
    expect(
      screen.getByTestId("action-config-brand-logo-send-slack"),
    ).toBeTruthy();
  });

  test("shows human-readable action labels in the trigger", () => {
    render(
      <ActionConfig
        config={{ actionType: "send-slack" }}
        onUpdateConfig={mock((_key: string, _value: unknown) => {})}
      />,
    );

    expect(screen.getByText("Send Channel Message")).toBeTruthy();
  });

  test("renders token pills in resend text and textarea fields", () => {
    const { container } = render(
      <ActionConfig
        config={{
          actionType: "send-resend",
          subject: "Reminder for @Appointment.data.startAt",
          message: "Event @Appointment.data.appointmentId",
        }}
        onUpdateConfig={mock((_key: string, _value: unknown) => {})}
      />,
    );

    const tokens = container.querySelectorAll("[data-expression-token='true']");
    expect(tokens.length).toBe(2);
  });

  test("renders token pills in resend template fields", () => {
    const { container } = render(
      <ActionConfig
        config={{
          actionType: "send-resend-template",
          templateIdOrAlias: "@Action1.templateAlias",
          fromName: "@Action1.senderName",
          templateVariables: [
            { key: "PRODUCT", value: "@Appointment.data.appointmentId" },
          ],
        }}
        onUpdateConfig={mock((_key: string, _value: unknown) => {})}
      />,
    );

    const tokens = container.querySelectorAll("[data-expression-token='true']");
    expect(tokens.length).toBe(3);
  });

  test("supports removing template variable rows", () => {
    const onUpdateConfig = mock((_key: string, _value: unknown) => {});

    render(
      <ActionConfig
        config={{
          actionType: "send-resend-template",
          templateVariables: [{ key: "PRODUCT", value: "Widget" }],
        }}
        onUpdateConfig={onUpdateConfig}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove variable" }));

    expect(onUpdateConfig).toHaveBeenCalledWith("templateVariables", []);
  });

  test("uses responsive layout classes for template variable rows", () => {
    render(
      <ActionConfig
        config={{
          actionType: "send-resend-template",
          templateVariables: [{ key: "PRODUCT", value: "Widget" }],
        }}
        onUpdateConfig={mock((_key: string, _value: unknown) => {})}
      />,
    );

    const removeButton = screen.getByRole("button", {
      name: "Remove variable",
    });
    const row = removeButton.parentElement;

    if (!row) {
      throw new Error("Expected template variable row");
    }

    expect(row.className).toContain("grid");
    expect(row.className).toContain("gap-2");
    expect(row.className).toContain(
      "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]",
    );
    expect(removeButton.className).toContain("lg:justify-self-end");
  });

  test("uses responsive layout classes for service and action pickers", () => {
    render(
      <ActionConfig
        config={{ actionType: "send-slack" }}
        onUpdateConfig={mock((_key: string, _value: unknown) => {})}
      />,
    );

    const serviceField = screen.getByText("Service").closest("div");
    const actionField = screen.getByText("Action").closest("div");

    if (!(serviceField && actionField)) {
      throw new Error("Expected service and action field containers");
    }

    const pickerGrid = serviceField.parentElement;
    if (!pickerGrid) {
      throw new Error("Expected service/action picker grid");
    }

    expect(pickerGrid.className).toContain("grid-cols-1");
    expect(pickerGrid.className).toContain(
      "min-[640px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]",
    );
    expect(serviceField.className).toContain("min-w-0");
    expect(actionField.className).toContain("min-w-0");

    const [serviceTrigger, actionTrigger] = screen.getAllByRole("combobox");
    if (!(serviceTrigger && actionTrigger)) {
      throw new Error("Expected service and action triggers");
    }

    expect(serviceTrigger.className).toContain("min-w-0");
    expect(serviceTrigger.className).toContain("w-full");
    expect(actionTrigger.className).toContain("min-w-0");
    expect(actionTrigger.className).toContain("w-full");
  });

  test("commits latest template variable input value on blur", () => {
    const onUpdateConfig = mock((_key: string, _value: unknown) => {});

    render(
      <ActionConfig
        config={{ actionType: "send-resend-template" }}
        onUpdateConfig={onUpdateConfig}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add variable" }));

    const keyInput = screen.getByPlaceholderText("PRODUCT");
    fireEvent.change(keyInput, { target: { value: "PRODUCT" } });
    fireEvent.blur(keyInput);

    expect(onUpdateConfig).toHaveBeenCalledWith("templateVariables", [
      { key: "PRODUCT", value: "" },
    ]);
  });

  test("keeps empty template variable row visible after blur", () => {
    render(
      <StatefulActionConfig
        initialConfig={{ actionType: "send-resend-template" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add variable" }));

    const keyInput = screen.getByPlaceholderText("PRODUCT");
    fireEvent.blur(keyInput);

    expect(screen.getByPlaceholderText("PRODUCT")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove variable" }),
    ).toBeTruthy();
  });

  test("renders condition builder controls with appointment and client attributes", () => {
    render(
      <ActionConfig
        config={{ actionType: "condition", expression: "true" }}
        onUpdateConfig={mock((_key: string, _value: unknown) => {})}
      />,
    );

    expect(screen.getByRole("button", { name: "Builder" })).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Condition field" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Condition operator" }),
    ).toBeTruthy();
    expect(screen.getByText("Select property")).toBeTruthy();
    expect(screen.getByText("Select operator")).toBeTruthy();

    fireEvent.click(screen.getByRole("combobox", { name: "Condition field" }));
    expect(screen.getByText("Appointment Status")).toBeTruthy();
    expect(screen.getByText("Client First Name")).toBeTruthy();
    expect(screen.getByText("Client Last Name")).toBeTruthy();
    expect(screen.getByText("Client Email")).toBeTruthy();
    expect(screen.queryByText("Patient Status")).toBeNull();
  });

  test("shows human-readable selected labels in condition builder selects", () => {
    render(
      <StatefulActionConfig
        initialConfig={{
          actionType: "condition",
          expression: "",
          conditionMode: "builder",
          conditionField: "appointment.startAt",
          conditionOperator: "within_next",
          conditionValue: { amount: 3, unit: "hours" },
        }}
      />,
    );

    const fieldCombobox = screen.getByRole("combobox", {
      name: "Condition field",
    });
    expect(fieldCombobox.textContent).toContain("Start Time");
    expect(fieldCombobox.textContent).not.toContain("appointment.startAt");

    const operatorCombobox = screen.getByRole("combobox", {
      name: "Condition operator",
    });
    expect(operatorCombobox.textContent).toContain("is within the next");
    expect(operatorCombobox.textContent).not.toContain("within_next");

    const unitCombobox = screen.getByRole("combobox", {
      name: "Condition relative unit",
    });
    expect(unitCombobox.textContent).toContain("hours");
  });

  test("humanizes fallback select labels instead of showing raw enum tokens", () => {
    render(
      <ActionConfig
        config={{
          actionType: "send-resend",
          testBehavior: "route_to_integration_test_recipient_v2",
        }}
        onUpdateConfig={mock((_key: string, _value: unknown) => {})}
      />,
    );

    const testBehaviorLabel = screen.getByText("Test mode behavior");
    const testBehaviorCombobox = testBehaviorLabel
      .closest("div")
      ?.querySelector('[role="combobox"]');
    expect(testBehaviorCombobox).toBeTruthy();
    if (!testBehaviorCombobox) {
      throw new Error("Expected Test mode behavior combobox");
    }

    expect(testBehaviorCombobox.textContent).toContain(
      "Route To Integration Test Recipient V2",
    );
    expect(testBehaviorCombobox.textContent).not.toContain(
      "route_to_integration_test_recipient_v2",
    );
  });

  test("moves ago phrasing into the unit selector for past-relative operators", () => {
    render(
      <StatefulActionConfig
        initialConfig={{
          actionType: "condition",
          expression: "",
          conditionMode: "builder",
          conditionField: "appointment.startAt",
          conditionOperator: "more_than_ago",
          conditionValue: { amount: 3, unit: "hours" },
        }}
      />,
    );

    const operatorCombobox = screen.getByRole("combobox", {
      name: "Condition operator",
    });
    expect(operatorCombobox.textContent).toContain("is more than");
    expect(operatorCombobox.textContent).not.toContain("ago");

    const unitCombobox = screen.getByRole("combobox", {
      name: "Condition relative unit",
    });
    expect(unitCombobox.textContent).toContain("hours ago");

    fireEvent.click(unitCombobox);
    expect(screen.getAllByText("minutes ago").length).toBeGreaterThan(0);
    expect(screen.getAllByText("hours ago").length).toBeGreaterThan(0);
    expect(screen.getAllByText("days ago").length).toBeGreaterThan(0);
    expect(screen.getAllByText("weeks ago").length).toBeGreaterThan(0);
  });

  test("uses datetime-local input for absolute temporal condition values", () => {
    render(
      <ActionConfig
        config={{
          actionType: "condition",
          expression:
            'appointment.startAt != null && timestamp(string(appointment.startAt)) < date("2026-02-16T09:30", orgTimezone)',
          conditionMode: "builder",
          conditionField: "appointment.startAt",
          conditionOperator: "before",
          conditionValue: "2026-02-16T09:30",
        }}
        defaultTimezone="America/Chicago"
        onUpdateConfig={mock((_key: string, _value: unknown) => {})}
      />,
    );

    const input = screen.getByDisplayValue("2026-02-16T09:30");
    expect((input as HTMLInputElement).type).toBe("datetime-local");
    const timezoneCombobox = screen.getByRole("combobox", {
      name: "Condition timezone",
    });
    expect(timezoneCombobox.textContent).toContain("America/Chicago");
  });

  test("shows selected explicit timezone for absolute temporal condition values", () => {
    render(
      <ActionConfig
        config={{
          actionType: "condition",
          expression:
            'appointment.startAt != null && timestamp(string(appointment.startAt)) < date("2026-02-16T09:30", "America/Los_Angeles")',
          conditionMode: "builder",
          conditionField: "appointment.startAt",
          conditionOperator: "before",
          conditionValue: "2026-02-16T09:30",
          conditionTimezone: "America/Los_Angeles",
        }}
        onUpdateConfig={mock((_key: string, _value: unknown) => {})}
      />,
    );

    const timezoneCombobox = screen.getByRole("combobox", {
      name: "Condition timezone",
    });
    expect(timezoneCombobox.textContent).toContain("America/Los Angeles");
  });

  test("falls back to raw CEL mode for existing custom condition expressions", () => {
    render(
      <ActionConfig
        config={{
          actionType: "condition",
          expression: 'appointment.status == "scheduled"',
        }}
        onUpdateConfig={mock((_key: string, _value: unknown) => {})}
      />,
    );

    expect(screen.getByRole("button", { name: "Raw CEL" })).toBeTruthy();
    expect(
      screen.queryByRole("combobox", { name: "Condition field" }),
    ).toBeNull();
  });
});
