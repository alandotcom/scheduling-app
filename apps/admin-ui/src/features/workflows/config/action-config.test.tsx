import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ActionConfig } from "./action-config";

afterEach(() => {
  cleanup();
});

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

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onUpdateConfig).toHaveBeenCalledWith("templateVariables", []);
  });
});
