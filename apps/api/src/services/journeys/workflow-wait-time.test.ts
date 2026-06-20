import { describe, expect, test } from "bun:test";
import {
  parseDurationMs,
  parseTimestampWithTimezone,
  resolveWaitUntil,
} from "./workflow-wait-time.js";

describe("workflow wait time utilities", () => {
  test("parseDurationMs supports duration tokens and ISO durations", () => {
    expect(parseDurationMs("30d")).toBe(30 * 24 * 60 * 60 * 1000);
    expect(parseDurationMs("-1d")).toBe(-24 * 60 * 60 * 1000);
    expect(parseDurationMs("P1D")).toBe(24 * 60 * 60 * 1000);
    expect(parseDurationMs("PT30M")).toBe(30 * 60 * 1000);
    expect(parseDurationMs("3600000")).toBe(3_600_000);
  });

  test("resolveWaitUntil computes waitUntil from duration", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const result = resolveWaitUntil({
      now,
      waitDuration: "30d",
    });

    expect(result.error).toBeUndefined();
    expect(result.waitUntil?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  test("resolveWaitUntil applies negative offset to waitUntil", () => {
    const result = resolveWaitUntil({
      waitUntil: "2026-03-10T09:00:00-05:00",
      waitOffset: "-1d",
    });

    expect(result.error).toBeUndefined();
    expect(result.waitUntil?.toISOString()).toBe("2026-03-09T14:00:00.000Z");
  });

  test("parseTimestampWithTimezone parses naive timestamp with timezone", () => {
    const parsed = parseTimestampWithTimezone(
      "2026-03-10T09:00:00",
      "America/New_York",
    );

    expect(parsed?.toISOString()).toBe("2026-03-10T13:00:00.000Z");
  });

  test("shifts wait-until forward to the same-day allowed-hours start", () => {
    const result = resolveWaitUntil({
      waitUntil: "2026-03-10T08:00:00",
      waitTimezone: "America/New_York",
      waitAllowedHoursMode: "daily_window",
      waitAllowedStartTime: "09:00",
      waitAllowedEndTime: "17:00",
    });

    expect(result.error).toBeUndefined();
    expect(result.waitUntil?.toISOString()).toBe("2026-03-10T13:00:00.000Z");
  });

  test("shifts wait-until after window end to next-day window start", () => {
    const result = resolveWaitUntil({
      waitUntil: "2026-03-10T19:30:00",
      waitTimezone: "America/New_York",
      waitAllowedHoursMode: "daily_window",
      waitAllowedStartTime: "09:00",
      waitAllowedEndTime: "17:00",
    });

    expect(result.error).toBeUndefined();
    expect(result.waitUntil?.toISOString()).toBe("2026-03-11T13:00:00.000Z");
  });

  test("uses org timezone fallback for allowed-hours enforcement", () => {
    const result = resolveWaitUntil({
      waitUntil: "2026-03-10",
      orgTimezone: "America/New_York",
      waitAllowedHoursMode: "daily_window",
      waitAllowedStartTime: "09:00",
      waitAllowedEndTime: "17:00",
    });

    expect(result.error).toBeUndefined();
    expect(result.waitUntil?.toISOString()).toBe("2026-03-10T13:00:00.000Z");
  });

  test("returns validation error for invalid allowed-hours windows", () => {
    const result = resolveWaitUntil({
      waitDuration: "1h",
      waitAllowedHoursMode: "daily_window",
      waitAllowedStartTime: "17:00",
      waitAllowedEndTime: "09:00",
    });

    expect(result.error).toBe(
      "Invalid allowed-hours window. waitAllowedStartTime must be earlier than waitAllowedEndTime.",
    );
  });

  test("returns validation error for invalid wait timezone", () => {
    const result = resolveWaitUntil({
      waitUntil: "2026-03-10T09:00:00",
      waitTimezone: "Not/AZone",
    });

    expect(result.error).toBe(
      "Invalid waitTimezone value. Use a valid IANA timezone like America/New_York.",
    );
  });
});
