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
});
