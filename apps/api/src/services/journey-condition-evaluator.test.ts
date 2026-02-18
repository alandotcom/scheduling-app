import { describe, expect, test } from "bun:test";
import { evaluateJourneyConditionExpression } from "./journey-condition-evaluator.js";

const BASE_CONTEXT = {
  appointment: {
    status: "scheduled",
    startAt: "2026-02-16T10:30:00.000Z",
  },
  client: {
    email: "client@example.com",
  },
};

describe("journey condition evaluator", () => {
  test("supports relative timestamp expressions with now", () => {
    const result = evaluateJourneyConditionExpression({
      expression:
        'appointment.startAt != null && timestamp(string(appointment.startAt)) < now + duration("168h")',
      context: BASE_CONTEXT,
      now: new Date("2026-02-16T00:00:00.000Z"),
    });

    expect(result.error).toBeUndefined();
    expect(result.matched).toBe(true);
  });

  test("supports date helper with org timezone", () => {
    const result = evaluateJourneyConditionExpression({
      expression:
        'timestamp(string(appointment.startAt)) < date("2026-02-16", orgTimezone)',
      context: {
        ...BASE_CONTEXT,
        appointment: {
          ...BASE_CONTEXT.appointment,
          startAt: "2026-02-16T04:30:00.000Z",
        },
      },
      orgTimezone: "America/New_York",
    });

    expect(result.error).toBeUndefined();
    expect(result.matched).toBe(true);
  });

  test("supports datetime helper values with org timezone semantics", () => {
    const expression =
      'timestamp(string(appointment.startAt)) < date("2026-02-16T10:00", orgTimezone)';

    const context = {
      ...BASE_CONTEXT,
      appointment: {
        ...BASE_CONTEXT.appointment,
        startAt: "2026-02-16T16:00:00.000Z",
      },
    };

    const inNewYork = evaluateJourneyConditionExpression({
      expression,
      context,
      orgTimezone: "America/New_York",
    });
    expect(inNewYork.error).toBeUndefined();
    expect(inNewYork.matched).toBe(false);

    const inLosAngeles = evaluateJourneyConditionExpression({
      expression,
      context,
      orgTimezone: "America/Los_Angeles",
    });
    expect(inLosAngeles.error).toBeUndefined();
    expect(inLosAngeles.matched).toBe(true);
  });
});
