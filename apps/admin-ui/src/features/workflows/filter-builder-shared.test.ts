import { describe, expect, test } from "bun:test";
import {
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
});
