import { describe, expect, test } from "bun:test";
import {
  CLIENT_WORKFLOW_FILTER_FIELD_OPTIONS,
  getClientWorkflowFilterFieldOptions,
  toAbsoluteTemporalComparisonValue,
  toDateTimeLocalInputValue,
} from "./filter-builder-shared";

describe("workflow filter temporal helpers", () => {
  test("formats date-only values as datetime-local midnight", () => {
    expect(toDateTimeLocalInputValue("2026-02-16")).toBe("2026-02-16T00:00");
  });

  test("preserves naive datetime-local minute precision", () => {
    expect(toDateTimeLocalInputValue("2026-02-16T09:30")).toBe(
      "2026-02-16T09:30",
    );
  });

  test("normalizes timezone-aware ISO strings for datetime-local input", () => {
    const formatted = toDateTimeLocalInputValue("2026-02-16T09:30:00Z");
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  test("returns empty string for invalid temporal input", () => {
    expect(toDateTimeLocalInputValue("not-a-date")).toBe("");
  });

  test("accepts ISO-compatible temporal comparison values", () => {
    expect(toAbsoluteTemporalComparisonValue("2026-02-16T09:30")).toBe(
      "2026-02-16T09:30",
    );
  });

  test("rejects invalid temporal comparison values", () => {
    expect(toAbsoluteTemporalComparisonValue("invalid")).toBe("");
  });

  test("returns baseline client filter options when no custom attributes exist", () => {
    expect(getClientWorkflowFilterFieldOptions()).toEqual(
      CLIENT_WORKFLOW_FILTER_FIELD_OPTIONS,
    );
  });

  test("appends client custom attribute field options with mapped types", () => {
    const options = getClientWorkflowFilterFieldOptions([
      {
        fieldKey: "renewalDate",
        label: "Renewal Date",
        type: "DATE",
      },
      {
        fieldKey: "planName",
        label: "Plan Name",
        type: "TEXT",
      },
    ]);

    expect(options).toContainEqual({
      label: "Renewal Date",
      value: "client.customAttributes.renewalDate",
      type: "timestamp",
    });
    expect(options).toContainEqual({
      label: "Plan Name",
      value: "client.customAttributes.planName",
      type: "string",
    });
  });
});
