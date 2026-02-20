/// <reference lib="dom" />

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEventDriver from "@testing-library/user-event";
import type { CustomAttributeDefinitionResponse } from "@scheduling/dto";

import { ClientForm } from "@/components/clients/client-form";

afterEach(() => {
  cleanup();
});

const customFieldDefinitions: CustomAttributeDefinitionResponse[] = [
  {
    id: "00000000-0000-7000-8000-000000000010",
    orgId: "00000000-0000-7000-8000-000000000011",
    fieldKey: "leadScore",
    label: "Lead Score",
    type: "NUMBER",
    required: false,
    options: null,
    displayOrder: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
];

describe("ClientForm", () => {
  test("renders custom fields inside a responsive two-column grid", () => {
    render(
      <ClientForm
        onSubmit={() => {}}
        onCancel={() => {}}
        isSubmitting={false}
        shortcutsEnabled={false}
        customFieldDefinitions={customFieldDefinitions}
      />,
    );

    const customFieldsHeading = screen.getByText("Custom Fields");
    const section = customFieldsHeading.parentElement;
    const grid = section?.querySelector("div.grid");

    expect(grid?.className).toContain("grid-cols-1");
    expect(grid?.className).toContain("sm:grid-cols-2");
  });

  test("disables save when pristine and enables it after changes", async () => {
    const user = userEventDriver.setup();

    render(
      <ClientForm
        defaultValues={{
          firstName: "John",
          lastName: "Smith",
          email: "john@example.com",
          phone: "",
          phoneCountry: "US",
          customAttributes: {},
        }}
        onSubmit={() => {}}
        onCancel={() => {}}
        isSubmitting={false}
        shortcutsEnabled={false}
        disableSubmitWhenPristine
      />,
    );

    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton.hasAttribute("disabled")).toBe(true);

    await user.type(screen.getByLabelText("First Name"), "x");
    expect(saveButton.hasAttribute("disabled")).toBe(false);
  });
});
