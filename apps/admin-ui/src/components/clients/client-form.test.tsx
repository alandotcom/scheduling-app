/// <reference lib="dom" />

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEventDriver from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import type { CustomAttributeDefinitionResponse } from "@scheduling/dto";
import { toast } from "sonner";

import { ClientForm } from "@/components/clients/client-form";
import { createTestQueryClient } from "@/test-utils/render";

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

const relationFieldDefinitions: CustomAttributeDefinitionResponse[] = [
  {
    id: "00000000-0000-7000-8000-000000000020",
    orgId: "00000000-0000-7000-8000-000000000021",
    fieldKey: "leadScore",
    label: "Lead Score",
    type: "NUMBER",
    required: false,
    options: null,
    relationConfig: null,
    displayOrder: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "00000000-0000-7000-8000-000000000022",
    orgId: "00000000-0000-7000-8000-000000000021",
    fieldKey: "relatedClient",
    label: "Related Client",
    type: "RELATION_CLIENT",
    required: false,
    options: null,
    relationConfig: {
      targetEntity: "CLIENT",
      valueMode: "single",
      pairedDefinitionId: null,
      pairedRole: null,
    },
    displayOrder: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
];

function renderClientForm(props: Parameters<typeof ClientForm>[0]) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ClientForm {...props} />
    </QueryClientProvider>,
  );
}

describe("ClientForm", () => {
  test("renders custom fields inside a responsive two-column grid", () => {
    renderClientForm({
      onSubmit: () => {},
      onCancel: () => {},
      isSubmitting: false,
      shortcutsEnabled: false,
      customFieldDefinitions,
    });

    const customFieldsHeading = screen.getByText("Custom Fields");
    const section = customFieldsHeading.parentElement;
    const grid = section?.querySelector("div.grid");

    expect(grid?.className).toContain("grid-cols-1");
    expect(grid?.className).toContain("sm:grid-cols-2");
  });

  test("shows form sub-tabs and separates relation fields", async () => {
    const user = userEventDriver.setup();

    renderClientForm({
      defaultValues: {
        firstName: "Taylor",
        lastName: "Jordan",
        email: "",
        phone: "",
        phoneCountry: "US",
        customAttributes: {},
      },
      onSubmit: () => {},
      onCancel: () => {},
      isSubmitting: false,
      shortcutsEnabled: false,
      customFieldDefinitions: relationFieldDefinitions,
    });

    expect(screen.getByRole("tab", { name: "Profile" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Relationships" })).toBeTruthy();
    expect(screen.getByLabelText("Lead Score (optional)")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Related Client (optional)" }),
    ).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Relationships" }));

    expect(
      screen.getByRole("button", { name: "Related Client (optional)" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Lead Score (optional)")).toBeNull();
  });

  test("supports forcing the relationships section without rendering sub-tabs", () => {
    renderClientForm({
      defaultValues: {
        firstName: "Taylor",
        lastName: "Jordan",
        email: "",
        phone: "",
        phoneCountry: "US",
        customAttributes: {},
      },
      onSubmit: () => {},
      onCancel: () => {},
      isSubmitting: false,
      shortcutsEnabled: false,
      customFieldDefinitions: relationFieldDefinitions,
      forcedSection: "relationships",
    });

    expect(screen.queryByRole("tab", { name: "Profile" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Relationships" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Related Client (optional)" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("First Name")).toBeNull();
    expect(screen.queryByLabelText("Lead Score (optional)")).toBeNull();
  });

  test("hides relationships tab when there are no relation fields", () => {
    renderClientForm({
      onSubmit: () => {},
      onCancel: () => {},
      isSubmitting: false,
      shortcutsEnabled: false,
      customFieldDefinitions,
    });

    expect(screen.queryByRole("tab", { name: "Profile" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Relationships" })).toBeNull();
  });

  test("switches to relationships tab when first submit error is on a relation field", async () => {
    const user = userEventDriver.setup();
    const onSubmit = mock((_data: unknown) => {});

    renderClientForm({
      defaultValues: {
        firstName: "Taylor",
        lastName: "Jordan",
        email: "",
        phone: "",
        phoneCountry: "US",
        customAttributes: {
          relatedClient: { invalid: true } as unknown as string,
        },
      },
      onSubmit,
      onCancel: () => {},
      isSubmitting: false,
      shortcutsEnabled: false,
      customFieldDefinitions: relationFieldDefinitions,
    });

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledTimes(0);
    expect(
      screen
        .getByRole("tab", { name: "Relationships" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Related Client (optional)" }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement?.id).toBe("ca-relatedClient");
    });
  });

  test("disables save when pristine and enables it after changes", async () => {
    const user = userEventDriver.setup();

    renderClientForm({
      defaultValues: {
        firstName: "John",
        lastName: "Smith",
        email: "john@example.com",
        phone: "",
        phoneCountry: "US",
        customAttributes: {},
      },
      onSubmit: () => {},
      onCancel: () => {},
      isSubmitting: false,
      shortcutsEnabled: false,
      disableSubmitWhenPristine: true,
    });

    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton.hasAttribute("disabled")).toBe(true);

    await user.type(screen.getByLabelText("First Name"), "x");
    expect(saveButton.hasAttribute("disabled")).toBe(false);
  });

  test("shows visible feedback and focuses first invalid field on invalid submit", async () => {
    const user = userEventDriver.setup();
    const onSubmit = mock((_data: unknown) => {});
    const onInvalidSubmit = mock((_errors: unknown) => {});

    renderClientForm({
      defaultValues: {
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        phoneCountry: "US",
        customAttributes: {},
      },
      onSubmit,
      onInvalidSubmit,
      onCancel: () => {},
      isSubmitting: false,
      shortcutsEnabled: false,
    });

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

    renderClientForm({
      defaultValues: {
        firstName: "New",
        lastName: "Client",
        email: "",
        phone: "",
        phoneCountry: "US",
        customAttributes: {},
      },
      onSubmit,
      onCancel: () => {},
      isSubmitting: false,
      shortcutsEnabled: false,
      customFieldDefinitions: optionalSelectFieldDefinitions,
    });

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
