// Tests for useScheduleAppointments hook and helper functions

import { describe, expect, test } from "bun:test";
import { DateTime } from "luxon";
import {
  getWeekStart,
  formatDateParam,
  parseDateParam,
} from "./use-schedule-appointments";

describe("getWeekStart", () => {
  test("returns Sunday for a Monday date", () => {
    // Monday, Jan 6, 2025
    const monday = DateTime.local(2025, 1, 6, 10, 30, 0);
    const result = getWeekStart(monday);

    expect(result.weekday % 7).toBe(0); // Sunday
    expect(result.day).toBe(5); // Jan 5
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(0);
  });

  test("returns same day for a Sunday date", () => {
    // Sunday, Jan 5, 2025
    const sunday = DateTime.local(2025, 1, 5, 15, 0, 0);
    const result = getWeekStart(sunday);

    expect(result.weekday % 7).toBe(0);
    expect(result.day).toBe(5);
    expect(result.hour).toBe(0);
  });

  test("returns previous Sunday for a Saturday date", () => {
    // Saturday, Jan 11, 2025
    const saturday = DateTime.local(2025, 1, 11, 18, 0, 0);
    const result = getWeekStart(saturday);

    expect(result.weekday % 7).toBe(0);
    expect(result.day).toBe(5); // Jan 5
  });

  test("handles month boundary", () => {
    // Wednesday, Feb 5, 2025
    const wednesday = DateTime.local(2025, 2, 5, 12, 0, 0);
    const result = getWeekStart(wednesday);

    expect(result.weekday % 7).toBe(0);
    expect(result.month).toBe(2); // February
    expect(result.day).toBe(2); // Feb 2
  });

  test("handles year boundary", () => {
    // Wednesday, Jan 1, 2025
    const wednesday = DateTime.local(2025, 1, 1, 12, 0, 0);
    const result = getWeekStart(wednesday);

    expect(result.weekday % 7).toBe(0);
    expect(result.year).toBe(2024);
    expect(result.month).toBe(12); // December
    expect(result.day).toBe(29); // Dec 29, 2024
  });
});

describe("formatDateParam", () => {
  test("formats date as YYYY-MM-DD", () => {
    const date = DateTime.local(2025, 1, 15); // Jan 15, 2025
    const result = formatDateParam(date);
    expect(result).toBe("2025-01-15");
  });

  test("pads single-digit month and day", () => {
    const date = DateTime.local(2025, 5, 5); // May 5, 2025
    const result = formatDateParam(date);
    expect(result).toBe("2025-05-05");
  });

  test("handles December correctly", () => {
    const date = DateTime.local(2025, 12, 25); // Dec 25, 2025
    const result = formatDateParam(date);
    expect(result).toBe("2025-12-25");
  });
});

describe("parseDateParam", () => {
  test("parses YYYY-MM-DD to Date", () => {
    const result = parseDateParam("2025-01-15");

    expect(result.year).toBe(2025);
    expect(result.month).toBe(1); // January
    expect(result.day).toBe(15);
  });

  test("parses single-digit padded month and day", () => {
    const result = parseDateParam("2025-05-05");

    expect(result.year).toBe(2025);
    expect(result.month).toBe(5); // May
    expect(result.day).toBe(5);
  });

  test("round-trips with formatDateParam", () => {
    const original = DateTime.local(2025, 7, 20); // July 20, 2025
    const formatted = formatDateParam(original);
    const parsed = parseDateParam(formatted);

    expect(parsed.year).toBe(original.year);
    expect(parsed.month).toBe(original.month);
    expect(parsed.day).toBe(original.day);
  });
});
