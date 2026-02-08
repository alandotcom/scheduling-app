import { describe, expect, test } from "bun:test";
import {
  isSchedulingTimezoneMode,
  resolveEffectiveSchedulingTimezone,
} from "./scheduling-timezone";

describe("isSchedulingTimezoneMode", () => {
  test("accepts known modes", () => {
    expect(isSchedulingTimezoneMode("calendar")).toBe(true);
    expect(isSchedulingTimezoneMode("viewer")).toBe(true);
  });

  test("rejects unknown modes", () => {
    expect(isSchedulingTimezoneMode("local")).toBe(false);
  });
});

describe("resolveEffectiveSchedulingTimezone", () => {
  test("uses viewer timezone in viewer mode", () => {
    expect(
      resolveEffectiveSchedulingTimezone({
        mode: "viewer",
        viewerTimezone: "America/Chicago",
        calendarTimezone: "America/Los_Angeles",
      }),
    ).toBe("America/Chicago");
  });

  test("prefers calendar timezone in calendar mode", () => {
    expect(
      resolveEffectiveSchedulingTimezone({
        mode: "calendar",
        viewerTimezone: "America/Chicago",
        calendarTimezone: "America/Los_Angeles",
        selectedTimezone: "America/New_York",
      }),
    ).toBe("America/Los_Angeles");
  });

  test("falls back to selected timezone in calendar mode", () => {
    expect(
      resolveEffectiveSchedulingTimezone({
        mode: "calendar",
        viewerTimezone: "America/Chicago",
        selectedTimezone: "America/New_York",
      }),
    ).toBe("America/New_York");
  });
});
