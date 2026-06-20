import { describe, expect, test } from "bun:test";
import { DateTime } from "luxon";
import { parseHm, setZonedTime, sundayZeroWeekday } from "./calendar-time.js";

describe("sundayZeroWeekday", () => {
  test("maps Luxon weekday (1=Mon..7=Sun) to 0=Sun..6=Sat", () => {
    const sunday = DateTime.fromISO("2026-06-21", { zone: "utc" }); // Sunday
    const monday = DateTime.fromISO("2026-06-22", { zone: "utc" });
    const saturday = DateTime.fromISO("2026-06-20", { zone: "utc" });
    expect(sundayZeroWeekday(sunday)).toBe(0);
    expect(sundayZeroWeekday(monday)).toBe(1);
    expect(sundayZeroWeekday(saturday)).toBe(6);
  });
});

describe("parseHm", () => {
  test("parses HH:MM", () => {
    expect(parseHm("09:30")).toEqual({ hour: 9, minute: 30 });
    expect(parseHm("00:00")).toEqual({ hour: 0, minute: 0 });
    expect(parseHm("23:59")).toEqual({ hour: 23, minute: 59 });
  });

  test("defaults a missing minute to 0", () => {
    expect(parseHm("9")).toEqual({ hour: 9, minute: 0 });
  });
});

describe("setZonedTime", () => {
  test("sets hour/minute and zeroes seconds/millis on the given day", () => {
    const day = DateTime.fromISO("2026-06-20T13:45:30.500", { zone: "utc" });
    const result = setZonedTime(day, { hour: 9, minute: 15 });
    expect(result.hour).toBe(9);
    expect(result.minute).toBe(15);
    expect(result.second).toBe(0);
    expect(result.millisecond).toBe(0);
    expect(result.toISODate()).toBe("2026-06-20");
  });
});
