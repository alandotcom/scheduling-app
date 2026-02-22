import { describe, expect, test } from "bun:test";
import {
  compileConditionBuilderExpression,
  compileConditionFilterBuilderExpression,
} from "./action-config-renderer";

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

  test("compiles ID contains operator to CEL list membership", () => {
    const expression = compileConditionBuilderExpression({
      field: "appointment.calendarId",
      operator: "in",
      value: ["cal-1", "cal-2"],
    });

    expect(expression).toBe('appointment.calendarId in ["cal-1", "cal-2"]');
  });

  test("compiles boolean equality conditions", () => {
    const expression = compileConditionBuilderExpression({
      field: "client.customAttributes.newsletterOptIn",
      operator: "equals",
      value: false,
    });

    expect(expression).toBe("client.customAttributes.newsletterOptIn == false");
  });

  test("compiles grouped condition filters with root and group logic", () => {
    const expression = compileConditionFilterBuilderExpression({
      logic: "or",
      groups: [
        {
          logic: "and",
          conditions: [
            {
              field: "appointment.status",
              operator: "equals",
              value: "scheduled",
            },
            {
              field: "client.email",
              operator: "is_set",
            },
          ],
        },
        {
          logic: "and",
          conditions: [
            {
              field: "appointment.calendarId",
              operator: "equals",
              value: "cal-1",
            },
          ],
        },
      ],
    });

    expect(expression).toBe(
      '((appointment.status == "scheduled" && client.email != null) || appointment.calendarId == "cal-1")',
    );
  });

  test("returns empty string when any grouped condition is incomplete", () => {
    const expression = compileConditionFilterBuilderExpression({
      logic: "and",
      groups: [
        {
          logic: "and",
          conditions: [
            {
              field: "appointment.status",
              operator: "",
              value: "scheduled",
            },
          ],
        },
      ],
    });

    expect(expression).toBe("");
  });
});
