/// <reference lib="dom" />

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEventDriver from "@testing-library/user-event";
import type { CustomAttributeDefinitionResponse } from "@scheduling/dto";
import { toast } from "sonner";

import { ClientForm } from "@/components/clients/client-form";

const originalToastError = toast.error;

beforeEach(() => {
  const errorSpy = mock((..._args: Parameters<typeof toast.error>) => 1);
  Object.assign(toast, {
    error: errorSpy,
  });
});

afterEach(() => {
  cleanup();
  Object.assign(toast, {
    error: originalToastError,
  });
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

const optionalSelectFieldDefinitions: CustomAttributeDefinitionResponse[] = [
  {
    id: "00000000-0000-7000-8000-000000000012",
    orgId: "00000000-0000-7000-8000-000000000011",
    fieldKey: "preferredLanguage",
    label: "Preferred Language",
    type: "SELECT",
    required: false,
    options: ["English", "Spanish"],
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

  test("shows visible feedback and focuses first invalid field on invalid submit", async () => {
    const user = userEventDriver.setup();
    const onSubmit = mock((_data: unknown) => {});
    const onInvalidSubmit = mock((_errors: unknown) => {});

    render(
      <ClientForm
        defaultValues={{
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          phoneCountry: "US",
          customAttributes: {},
        }}
        onSubmit={onSubmit}
        onInvalidSubmit={onInvalidSubmit}
        onCancel={() => {}}
        isSubmitting={false}
        shortcutsEnabled={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledTimes(0);
    expect(onInvalidSubmit).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "Please fix highlighted fields before saving",
    );
    expect(
      screen.getByText(
        "Please review the highlighted fields and try saving again.",
      ),
    ).toBeTruthy();
    expect(document.activeElement?.id).toBe("firstName");
  });

  test("submits when optional custom fields are untouched", async () => {
    const user = userEventDriver.setup();
    const onSubmit = mock((_data: unknown) => {});

    render(
      <ClientForm
        defaultValues={{
          firstName: "New",
          lastName: "Client",
          email: "",
          phone: "",
          phoneCountry: "US",
          customAttributes: {},
        }}
        onSubmit={onSubmit}
        onCancel={() => {}}
        isSubmitting={false}
        shortcutsEnabled={false}
        customFieldDefinitions={optionalSelectFieldDefinitions}
      />,
    );

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
