/// <reference lib="dom" />

import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { SlotUsage } from "@scheduling/dto";

import {
  CustomFieldForm,
  getRelationValueModeLabel,
} from "./custom-field-form";

afterEach(() => {
  cleanup();
});

const BASE_SLOT_USAGE: SlotUsage = {
  t: { used: 0, total: 3 },
  n: { used: 0, total: 3 },
  d: { used: 0, total: 3 },
  b: { used: 0, total: 3 },
  j: { used: 0, total: 3 },
};

describe("CustomFieldForm type labels", () => {
  test("shows a human-readable default type label in create mode", () => {
    render(
      <CustomFieldForm
        mode="create"
        slotUsage={BASE_SLOT_USAGE}
        onSubmit={() => {}}
        onCancel={() => {}}
        isSubmitting={false}
      />,
    );

    expect(screen.getByText("Text")).toBeTruthy();
    expect(screen.queryByText("TEXT")).toBeNull();
  });

  test("shows a human-readable type label in edit mode", () => {
    render(
      <CustomFieldForm
        mode="edit"
        defaultValues={{
          fieldKey: "notes",
          label: "Notes",
          type: "TEXT",
          required: false,
          options: null,
        }}
        slotUsage={BASE_SLOT_USAGE}
        onSubmit={() => {}}
        onCancel={() => {}}
        isSubmitting={false}
      />,
    );

    expect(screen.getByDisplayValue("Text")).toBeTruthy();
    expect(screen.queryByDisplayValue("TEXT")).toBeNull();
  });

  test("uses human-readable type labels in slot warnings", () => {
    render(
      <CustomFieldForm
        mode="create"
        slotUsage={{
          ...BASE_SLOT_USAGE,
          t: { used: 1, total: 1 },
        }}
        onSubmit={() => {}}
        onCancel={() => {}}
        isSubmitting={false}
      />,
    );

    expect(
      screen.getByText("No available slots for Text type. Maximum 1 reached."),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "No available slots for TEXT type. Maximum 1 reached.",
      ),
    ).toBeNull();
  });

  test("maps relation value mode keys to human-readable labels", () => {
    expect(getRelationValueModeLabel("single")).toBe("Single client");
    expect(getRelationValueModeLabel("multi")).toBe("Multiple clients");
    expect(getRelationValueModeLabel("unknown-mode")).toBe("Unknown selection");
  });
});
