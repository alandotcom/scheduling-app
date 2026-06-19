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

  test("single-arg date helper resolves in the org timezone, not hardcoded UTC", () => {
    // 2026-02-16 local midnight is 05:00Z in New York (UTC-5) and 00:00Z in UTC,
    // so an appointment at 03:00Z falls before the NY boundary but after the UTC
    // boundary. The bare date("...") literal must follow the org timezone.
    const expression =
      'timestamp(string(appointment.startAt)) < date("2026-02-16")';
    const context = {
      ...BASE_CONTEXT,
      appointment: {
        ...BASE_CONTEXT.appointment,
        startAt: "2026-02-16T03:00:00.000Z",
      },
    };

    const inNewYork = evaluateJourneyConditionExpression({
      expression,
      context,
      orgTimezone: "America/New_York",
    });
    expect(inNewYork.error).toBeUndefined();
    expect(inNewYork.matched).toBe(true);

    const inUtc = evaluateJourneyConditionExpression({
      expression,
      context,
      orgTimezone: "UTC",
    });
    expect(inUtc.error).toBeUndefined();
    expect(inUtc.matched).toBe(false);
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
