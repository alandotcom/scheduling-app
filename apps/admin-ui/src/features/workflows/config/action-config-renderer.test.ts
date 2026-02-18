import { describe, expect, test } from "bun:test";
import { compileConditionBuilderExpression } from "./action-config-renderer";

describe("compileConditionBuilderExpression", () => {
  test("preserves full datetime literals for absolute temporal conditions", () => {
    const expression = compileConditionBuilderExpression({
      field: "appointment.startAt",
      operator: "before",
      value: "2026-02-18T14:45",
    });

    expect(expression).toBe(
      'appointment.startAt != null && timestamp(string(appointment.startAt)) < date("2026-02-18T14:45", orgTimezone)',
    );
  });

  test("supports inclusive absolute temporal operators", () => {
    const expression = compileConditionBuilderExpression({
      field: "appointment.startAt",
      operator: "on_or_before",
      value: "2026-02-18T14:45",
    });

    expect(expression).toBe(
      'appointment.startAt != null && timestamp(string(appointment.startAt)) <= date("2026-02-18T14:45", orgTimezone)',
    );
  });

  test("uses an explicit timezone literal when provided", () => {
    const expression = compileConditionBuilderExpression({
      field: "appointment.startAt",
      operator: "before",
      value: "2026-02-18T14:45",
      timezone: "America/Los_Angeles",
    });

    expect(expression).toBe(
      'appointment.startAt != null && timestamp(string(appointment.startAt)) < date("2026-02-18T14:45", "America/Los_Angeles")',
    );
  });
});
