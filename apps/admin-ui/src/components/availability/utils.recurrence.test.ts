import { describe, expect, test } from "bun:test";

import {
  buildRecurrenceRule,
  parseRecurrenceRule,
} from "@/components/availability/utils";

describe("blocked time recurrence helpers", () => {
  test("buildRecurrenceRule creates daily rule with until", () => {
    const rule = buildRecurrenceRule({
      type: "daily",
      startDate: "2026-02-09",
      startTime: "09:00",
      endDate: "2026-02-15",
      timezone: "America/Chicago",
    });

    expect(rule).toBe("FREQ=DAILY;UNTIL=20260215T150000Z");
  });

  test("buildRecurrenceRule creates weekly rule with selected weekdays", () => {
    const rule = buildRecurrenceRule({
      type: "weekly",
      startDate: "2026-02-09",
      startTime: "09:00",
      endDate: "2026-02-28",
      timezone: "America/Chicago",
      weekdays: [1, 3, 5],
    });

    expect(rule).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20260228T150000Z");
  });

  test("parseRecurrenceRule parses weekly byday and until date in timezone", () => {
    const parsed = parseRecurrenceRule(
      "FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20260228T150000Z",
      "America/Chicago",
    );

    expect(parsed.type).toBe("weekly");
    expect(parsed.weekdays).toEqual([1, 3, 5]);
    expect(parsed.untilDate).toBe("2026-02-28");
  });

  test("parseRecurrenceRule returns none for empty rule", () => {
    const parsed = parseRecurrenceRule(null, "America/Chicago");

    expect(parsed.type).toBe("none");
    expect(parsed.weekdays).toEqual([]);
    expect(parsed.untilDate).toBeNull();
  });
});
