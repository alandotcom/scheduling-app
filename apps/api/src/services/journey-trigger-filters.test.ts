import { describe, expect, test } from "bun:test";
import type { JourneyTriggerFilterAst } from "@scheduling/dto";
import { evaluateJourneyTriggerFilter } from "./journey-trigger-filters.js";

const BASE_CONTEXT = {
  appointment: {
    id: "appt-1",
    status: "scheduled",
    timezone: "America/New_York",
    startsAt: "2026-02-16T10:30:00.000Z",
  },
  client: {
    id: "client-1",
    email: "client@example.com",
  },
};

function createFilterAst(): JourneyTriggerFilterAst {
  return {
    logic: "and",
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
            field: "appointment.status",
            operator: "equals",
            value: "canceled",
            not: true,
          },
          {
            field: "client.email",
            operator: "is_set",
          },
        ],
      },
      {
        logic: "or",
        conditions: [
          {
            field: "appointment.startsAt",
            operator: "on_or_after",
            value: "2026-02-16T10:00:00.000Z",
          },
          {
            field: "appointment.timezone",
            operator: "equals",
            value: "America/Chicago",
          },
        ],
      },
    ],
  };
}

describe("journey trigger filter evaluator", () => {
  test("returns deterministic booleans for AND/OR/NOT, null checks, and date comparisons", () => {
    const filter = createFilterAst();

    const matches = evaluateJourneyTriggerFilter({
      filter,
      context: BASE_CONTEXT,
    });
    expect(matches.matched).toBe(true);

    const missingEmail = evaluateJourneyTriggerFilter({
      filter,
      context: {
        ...BASE_CONTEXT,
        client: {
          ...BASE_CONTEXT.client,
          email: null,
        },
      },
    });
    expect(missingEmail.matched).toBe(false);

    const beforeThreshold = evaluateJourneyTriggerFilter({
      filter,
      context: {
        ...BASE_CONTEXT,
        appointment: {
          ...BASE_CONTEXT.appointment,
          startsAt: "2026-02-16T08:30:00.000Z",
        },
      },
    });
    expect(beforeThreshold.matched).toBe(false);
  });

  test("fails closed when unsupported operations are encountered", () => {
    const filter = {
      logic: "and",
      groups: [
        {
          logic: "and",
          conditions: [
            {
              field: "appointment.status",
              operator: "regex_match",
              value: "^scheduled$",
            },
          ],
        },
      ],
    } as unknown as JourneyTriggerFilterAst;

    const result = evaluateJourneyTriggerFilter({
      filter,
      context: BASE_CONTEXT,
    });

    expect(result.matched).toBe(false);
    expect(result.error).toMatchObject({
      code: "UNSUPPORTED_OPERATION",
    });
  });
});
