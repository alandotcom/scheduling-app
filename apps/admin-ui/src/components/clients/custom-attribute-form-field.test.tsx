/// <reference lib="dom" />

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type { CustomAttributeDefinitionResponse } from "@scheduling/dto";

import { CustomAttributeFormField } from "@/components/clients/custom-attribute-form-field";
import { createTestQueryClient } from "@/test-utils/render";

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
    relationConfig: partial.relationConfig ?? null,
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

  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <TestForm />
    </QueryClientProvider>,
  );
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

    const input = screen.getByLabelText("Notes");
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

    const label = screen.getByText("Tags");
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

    const input = screen.getByLabelText("Lead Score");
    expect(input.closest("div")?.className).not.toContain("sm:col-span-2");
  });

  test("BOOLEAN fields render a stacked label and switch row", () => {
    renderField(
      createDefinition({
        fieldKey: "smsOptIn",
        label: "SMS Opt in",
        type: "BOOLEAN",
      }),
    );

    const label = screen.getByText("SMS Opt in");
    const wrapper = label.closest("div");
    const input = screen.getByLabelText("SMS Opt in");
    const toggle = screen.getByRole("switch");

    expect(wrapper?.className).not.toContain("sm:col-span-2");
    expect(wrapper?.firstElementChild).toBe(label);
    expect(input.getAttribute("id")).toBe("ca-smsOptIn");
    expect(toggle.closest("div")?.className).toContain("justify-end");
  });

  test("RELATION_CLIENT single mode renders a modal trigger", () => {
    function TestForm() {
      const { control } = useForm({
        defaultValues: { customAttributes: {} },
      });
      return (
        <CustomAttributeFormField
          definition={createDefinition({
            fieldKey: "referredBy",
            label: "Referred By",
            type: "RELATION_CLIENT",
            relationConfig: {
              targetEntity: "CLIENT",
              valueMode: "single",
              pairedDefinitionId: null,
              pairedRole: null,
            },
          })}
          control={control}
          clientOptions={[
            { value: "client-1", label: "Client One" },
            { value: "client-2", label: "Client Two" },
          ]}
        />
      );
    }

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TestForm />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Referred By")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Referred By" })).toBeTruthy();
    const singleSummary = screen.getByText("No client selected.");
    expect(singleSummary.closest("div")?.className).toContain("h-10");
  });

  test("RELATION_CLIENT multi mode renders a modal trigger", () => {
    function TestForm() {
      const { control } = useForm({
        defaultValues: { customAttributes: {} },
      });
      return (
        <CustomAttributeFormField
          definition={createDefinition({
            fieldKey: "relatedClients",
            label: "Related Clients",
            type: "RELATION_CLIENT",
            relationConfig: {
              targetEntity: "CLIENT",
              valueMode: "multi",
              pairedDefinitionId: null,
              pairedRole: null,
            },
          })}
          control={control}
          currentClientId="client-1"
          clientOptions={[
            { value: "client-1", label: "Current Client" },
            { value: "client-2", label: "Client Two" },
          ]}
        />
      );
    }

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TestForm />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Related Clients")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Related Clients" }),
    ).toBeTruthy();
    const multiSummary = screen.getByText("No clients selected.");
    expect(multiSummary.closest("div")?.className).toContain("h-10");
  });
});
