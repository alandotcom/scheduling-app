import { describe, expect, test } from "bun:test";
import type { CustomAttributeDefinitionResponse } from "@scheduling/dto";
import { getCustomFieldDeleteDescription } from "./custom-fields-section";

function buildDefinition(
  input: Partial<CustomAttributeDefinitionResponse> &
    Pick<
      CustomAttributeDefinitionResponse,
      "id" | "fieldKey" | "label" | "type"
    >,
): CustomAttributeDefinitionResponse {
  const now = new Date("2026-02-22T00:00:00.000Z");

  return {
    id: input.id,
    orgId: input.orgId ?? "00000000-0000-7000-8000-000000000001",
    fieldKey: input.fieldKey,
    label: input.label,
    type: input.type,
    required: input.required ?? false,
    options: input.options ?? null,
    relationConfig: input.relationConfig ?? null,
    displayOrder: input.displayOrder ?? 0,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

describe("getCustomFieldDeleteDescription", () => {
  test("returns generic delete copy for non-paired fields", () => {
    const definitions = [
      buildDefinition({
        id: "00000000-0000-7000-8000-000000000101",
        fieldKey: "favoriteColor",
        label: "Favorite Color",
        type: "TEXT",
      }),
    ];

    expect(
      getCustomFieldDeleteDescription(
        definitions,
        "00000000-0000-7000-8000-000000000101",
      ),
    ).toBe(
      "All client values for this field will be permanently removed. This action cannot be undone.",
    );
  });

  test("returns paired warning copy with both field names", () => {
    const definitions = [
      buildDefinition({
        id: "00000000-0000-7000-8000-000000000201",
        fieldKey: "referredBy",
        label: "Referred By",
        type: "RELATION_CLIENT",
        relationConfig: {
          targetEntity: "CLIENT",
          valueMode: "single",
          pairedDefinitionId: "00000000-0000-7000-8000-000000000202",
          pairedRole: "forward",
        },
      }),
      buildDefinition({
        id: "00000000-0000-7000-8000-000000000202",
        fieldKey: "referrals",
        label: "Referrals",
        type: "RELATION_CLIENT",
        relationConfig: {
          targetEntity: "CLIENT",
          valueMode: "multi",
          pairedDefinitionId: "00000000-0000-7000-8000-000000000201",
          pairedRole: "reverse",
        },
      }),
    ];

    expect(
      getCustomFieldDeleteDescription(
        definitions,
        "00000000-0000-7000-8000-000000000201",
      ),
    ).toBe(
      'This is a paired relation field. Deleting "Referred By" (referredBy) will also delete "Referrals" (referrals) and permanently remove all client values for both fields. This action cannot be undone.',
    );
  });
});
