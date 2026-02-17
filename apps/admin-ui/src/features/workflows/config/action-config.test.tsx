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
