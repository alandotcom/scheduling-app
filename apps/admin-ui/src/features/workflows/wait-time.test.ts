import { describe, expect, test } from "bun:test";
import {
  formatCountdown,
  parseDurationMs,
  parseTimestampWithTimezone,
  resolveWaitUntil,
} from "./wait-time";

describe("workflow wait-time", () => {
  test("parses duration tokens and ISO durations", () => {
    expect(parseDurationMs("30d")).toBe(30 * 24 * 60 * 60 * 1000);
    expect(parseDurationMs("-1d")).toBe(-24 * 60 * 60 * 1000);
    expect(parseDurationMs("P1D")).toBe(24 * 60 * 60 * 1000);
    expect(parseDurationMs("PT30M")).toBe(30 * 60 * 1000);
  });

  test("resolves wait-until with offset", () => {
    const resolved = resolveWaitUntil({
      waitUntil: "2026-03-10T09:00:00-05:00",
      waitOffset: "-1d",
    });

    expect(resolved.error).toBeUndefined();
    expect(resolved.waitUntil?.toISOString()).toBe("2026-03-09T14:00:00.000Z");
  });

  test("parses naive timestamp with timezone", () => {
    const parsed = parseTimestampWithTimezone(
      "2026-03-10T09:00:00",
      "America/New_York",
    );

    expect(parsed?.toISOString()).toBe("2026-03-10T13:00:00.000Z");
  });

  test("shifts wait-until forward to the same-day allowed-hours start", () => {
    const resolved = resolveWaitUntil({
      waitUntil: "2026-03-10T08:00:00",
      waitTimezone: "America/New_York",
      waitAllowedHoursMode: "daily_window",
      waitAllowedStartTime: "09:00",
      waitAllowedEndTime: "17:00",
    });

    expect(resolved.error).toBeUndefined();
    expect(resolved.waitUntil?.toISOString()).toBe("2026-03-10T13:00:00.000Z");
  });

  test("shifts wait-until after window end to next-day window start", () => {
    const resolved = resolveWaitUntil({
      waitUntil: "2026-03-10T19:30:00",
      waitTimezone: "America/New_York",
      waitAllowedHoursMode: "daily_window",
      waitAllowedStartTime: "09:00",
      waitAllowedEndTime: "17:00",
    });

    expect(resolved.error).toBeUndefined();
    expect(resolved.waitUntil?.toISOString()).toBe("2026-03-11T13:00:00.000Z");
  });

  test("uses org timezone fallback for allowed-hours enforcement", () => {
    const resolved = resolveWaitUntil({
      waitUntil: "2026-03-10",
      orgTimezone: "America/New_York",
      waitAllowedHoursMode: "daily_window",
      waitAllowedStartTime: "09:00",
      waitAllowedEndTime: "17:00",
    });

    expect(resolved.error).toBeUndefined();
    expect(resolved.waitUntil?.toISOString()).toBe("2026-03-10T13:00:00.000Z");
  });

  test("returns validation error for invalid allowed-hours windows", () => {
    const resolved = resolveWaitUntil({
      waitDuration: "1h",
      waitAllowedHoursMode: "daily_window",
      waitAllowedStartTime: "17:00",
      waitAllowedEndTime: "09:00",
    });

    expect(resolved.error).toBe(
      "Invalid allowed-hours window. waitAllowedStartTime must be earlier than waitAllowedEndTime.",
    );
  });

  test("returns validation error for invalid wait timezone", () => {
    const resolved = resolveWaitUntil({
      waitUntil: "2026-03-10T09:00:00",
      waitTimezone: "Not/AZone",
    });

    expect(resolved.error).toBe(
      "Invalid waitTimezone value. Use a valid IANA timezone like America/New_York.",
    );
  });

  test("formats countdown for node preview", () => {
    expect(formatCountdown(24 * 60 * 60 * 1000)).toBe("1 day 00:00:00");
  });
});
