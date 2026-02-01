// Tests for useScheduleAppointments hook and helper functions

import { describe, expect, test } from "bun:test";
import {
  getWeekStart,
  formatDateParam,
  parseDateParam,
} from "./use-schedule-appointments";

describe("getWeekStart", () => {
  test("returns Sunday for a Monday date", () => {
    // Monday, Jan 6, 2025
    const monday = new Date(2025, 0, 6, 10, 30, 0);
    const result = getWeekStart(monday);

    expect(result.getDay()).toBe(0); // Sunday
    expect(result.getDate()).toBe(5); // Jan 5
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  test("returns same day for a Sunday date", () => {
    // Sunday, Jan 5, 2025
    const sunday = new Date(2025, 0, 5, 15, 0, 0);
    const result = getWeekStart(sunday);

    expect(result.getDay()).toBe(0);
    expect(result.getDate()).toBe(5);
    expect(result.getHours()).toBe(0);
  });

  test("returns previous Sunday for a Saturday date", () => {
    // Saturday, Jan 11, 2025
    const saturday = new Date(2025, 0, 11, 18, 0, 0);
    const result = getWeekStart(saturday);

    expect(result.getDay()).toBe(0);
    expect(result.getDate()).toBe(5); // Jan 5
  });

  test("handles month boundary", () => {
    // Wednesday, Feb 5, 2025
    const wednesday = new Date(2025, 1, 5, 12, 0, 0);
    const result = getWeekStart(wednesday);

    expect(result.getDay()).toBe(0);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(2); // Feb 2
  });

  test("handles year boundary", () => {
    // Wednesday, Jan 1, 2025
    const wednesday = new Date(2025, 0, 1, 12, 0, 0);
    const result = getWeekStart(wednesday);

    expect(result.getDay()).toBe(0);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(11); // December
    expect(result.getDate()).toBe(29); // Dec 29, 2024
  });
});

describe("formatDateParam", () => {
  test("formats date as YYYY-MM-DD", () => {
    const date = new Date(2025, 0, 15); // Jan 15, 2025
    const result = formatDateParam(date);
    expect(result).toBe("2025-01-15");
  });

  test("pads single-digit month and day", () => {
    const date = new Date(2025, 4, 5); // May 5, 2025
    const result = formatDateParam(date);
    expect(result).toBe("2025-05-05");
  });

  test("handles December correctly", () => {
    const date = new Date(2025, 11, 25); // Dec 25, 2025
    const result = formatDateParam(date);
    expect(result).toBe("2025-12-25");
  });
});

describe("parseDateParam", () => {
  test("parses YYYY-MM-DD to Date", () => {
    const result = parseDateParam("2025-01-15");

    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(15);
  });

  test("parses single-digit padded month and day", () => {
    const result = parseDateParam("2025-05-05");

    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(4); // May
    expect(result.getDate()).toBe(5);
  });

  test("round-trips with formatDateParam", () => {
    const original = new Date(2025, 6, 20); // July 20, 2025
    const formatted = formatDateParam(original);
    const parsed = parseDateParam(formatted);

    expect(parsed.getFullYear()).toBe(original.getFullYear());
    expect(parsed.getMonth()).toBe(original.getMonth());
    expect(parsed.getDate()).toBe(original.getDate());
  });
});
