/// <reference lib="dom" />

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import type { CustomAttributeDefinitionResponse } from "@scheduling/dto";

import { CustomAttributeFormField } from "@/components/clients/custom-attribute-form-field";

afterEach(() => {
  cleanup();
});

function createDefinition(
  partial: Partial<CustomAttributeDefinitionResponse> & {
    fieldKey: string;
    label: string;
    type: CustomAttributeDefinitionResponse["type"];
  },
): CustomAttributeDefinitionResponse {
  return {
    id: "00000000-0000-7000-8000-000000000001",
    orgId: "00000000-0000-7000-8000-000000000002",
    fieldKey: partial.fieldKey,
    label: partial.label,
    type: partial.type,
    required: partial.required ?? false,
    options: partial.options ?? null,
    displayOrder: partial.displayOrder ?? 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function renderField(definition: CustomAttributeDefinitionResponse) {
  function TestForm() {
    const { control } = useForm({
      defaultValues: { customAttributes: {} },
    });
    return (
      <CustomAttributeFormField definition={definition} control={control} />
    );
  }

  return render(<TestForm />);
}

describe("CustomAttributeFormField layout", () => {
  test("TEXT fields use full-width grid span", () => {
    renderField(
      createDefinition({
        fieldKey: "notes",
        label: "Notes",
        type: "TEXT",
      }),
    );

    const input = screen.getByLabelText("Notes (optional)");
    expect(input.closest("div")?.className).toContain("sm:col-span-2");
  });

  test("MULTI_SELECT fields stay single-column width", () => {
    renderField(
      createDefinition({
        fieldKey: "tags",
        label: "Tags",
        type: "MULTI_SELECT",
        options: ["VIP", "Insurance", "Referral"],
      }),
    );

    const label = screen.getByText("Tags (optional)");
    expect(label.closest("div")?.className).not.toContain("sm:col-span-2");
  });

  test("NUMBER fields remain compact grid items", () => {
    renderField(
      createDefinition({
        fieldKey: "leadScore",
        label: "Lead Score",
        type: "NUMBER",
      }),
    );

    const input = screen.getByLabelText("Lead Score (optional)");
    expect(input.closest("div")?.className).not.toContain("sm:col-span-2");
  });
});
