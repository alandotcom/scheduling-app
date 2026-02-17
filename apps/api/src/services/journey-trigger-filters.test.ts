import { describe, expect, test } from "bun:test";
import type { JourneyTriggerFilterAst } from "@scheduling/dto";
import { evaluateJourneyTriggerFilter } from "./journey-trigger-filters.js";

const BASE_CONTEXT = {
  appointment: {
    id: "appt-1",
    status: "scheduled",
    timezone: "America/New_York",
    startAt: "2026-02-16T10:30:00.000Z",
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
            field: "appointment.startAt",
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
          startAt: "2026-02-16T08:30:00.000Z",
        },
      },
    });
    expect(beforeThreshold.matched).toBe(false);
  });

  test("supports relative temporal operators against now", () => {
    const now = new Date("2026-02-16T10:00:00.000Z");
    const withinNextFilter: JourneyTriggerFilterAst = {
      logic: "and",
      groups: [
        {
          logic: "and",
          conditions: [
            {
              field: "appointment.startAt",
              operator: "within_next",
              value: {
                amount: 3,
                unit: "days",
              },
            },
          ],
        },
      ],
    };

    const withinNext = evaluateJourneyTriggerFilter({
      filter: withinNextFilter,
      context: BASE_CONTEXT,
      now,
    });
    expect(withinNext.matched).toBe(true);

    const moreThanFromNowFilter: JourneyTriggerFilterAst = {
      logic: "and",
      groups: [
        {
          logic: "and",
          conditions: [
            {
              field: "appointment.startAt",
              operator: "more_than_from_now",
              value: {
                amount: 2,
                unit: "weeks",
              },
            },
          ],
        },
      ],
    };

    const moreThanFromNow = evaluateJourneyTriggerFilter({
      filter: moreThanFromNowFilter,
      context: BASE_CONTEXT,
      now,
    });
    expect(moreThanFromNow.matched).toBe(false);
  });

  test("evaluates date-only comparisons using org timezone midnight", () => {
    const filter: JourneyTriggerFilterAst = {
      logic: "and",
      groups: [
        {
          logic: "and",
          conditions: [
            {
              field: "appointment.startAt",
              operator: "before",
              value: "2026-02-16",
            },
          ],
        },
      ],
    };

    const result = evaluateJourneyTriggerFilter({
      filter,
      context: {
        ...BASE_CONTEXT,
        appointment: {
          ...BASE_CONTEXT.appointment,
          startAt: "2026-02-16T04:30:00.000Z",
        },
      },
      orgTimezone: "America/New_York",
    });

    expect(result.matched).toBe(true);
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
