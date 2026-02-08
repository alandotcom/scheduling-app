import { describe, expect, test } from "bun:test";
import { DateTime } from "luxon";

import {
  buildDayAvailabilityMap,
  filterAvailableSlotsForDate,
  getDayAvailabilityLevel,
  isPastDateForTimezone,
  isTodayForTimezone,
} from "@/components/appointments/day-availability";

describe("day availability helpers", () => {
  test("buildDayAvailabilityMap counts only available slots by local day", () => {
    const counts = buildDayAvailabilityMap(
      [
        {
          start: "2026-02-14T14:00:00.000Z",
          available: true,
        },
        {
          start: "2026-02-14T15:00:00.000Z",
          available: true,
        },
        {
          start: "2026-02-14T16:00:00.000Z",
          available: false,
        },
        {
          start: "2026-02-15T14:00:00.000Z",
          available: true,
        },
      ],
      "America/New_York",
    );

    expect(counts.get("2026-02-14")).toBe(2);
    expect(counts.get("2026-02-15")).toBe(1);
  });

  test("filterAvailableSlotsForDate returns only matching available slots", () => {
    const slots = filterAvailableSlotsForDate(
      [
        {
          start: "2026-02-14T14:00:00.000Z",
          end: "2026-02-14T14:30:00.000Z",
          available: true,
        },
        {
          start: "2026-02-14T15:00:00.000Z",
          end: "2026-02-14T15:30:00.000Z",
          available: false,
        },
        {
          start: "2026-02-15T14:00:00.000Z",
          end: "2026-02-15T14:30:00.000Z",
          available: true,
        },
      ],
      "2026-02-14",
      "America/New_York",
    );

    expect(slots).toHaveLength(1);
    expect(slots[0]?.start).toBe("2026-02-14T14:00:00.000Z");
  });

  test("getDayAvailabilityLevel classifies none, low, and good", () => {
    expect(getDayAvailabilityLevel(0)).toBe("none");
    expect(getDayAvailabilityLevel(1)).toBe("low");
    expect(getDayAvailabilityLevel(2)).toBe("low");
    expect(getDayAvailabilityLevel(3)).toBe("good");
  });

  test("isPastDateForTimezone compares against calendar timezone day", () => {
    const nowPst = DateTime.fromISO("2026-02-07T23:30:00", {
      zone: "America/Los_Angeles",
    });

    expect(isPastDateForTimezone("2026-02-07", "America/Chicago", nowPst)).toBe(
      true,
    );
    expect(isTodayForTimezone("2026-02-08", "America/Chicago", nowPst)).toBe(
      true,
    );
  });
});
