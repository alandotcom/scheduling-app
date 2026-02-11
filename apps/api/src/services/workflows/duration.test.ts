import { describe, expect, test } from "bun:test";
import { parseWorkflowDurationToMs } from "./duration.js";

describe("parseWorkflowDurationToMs", () => {
  test("parses ISO time-only durations", () => {
    expect(parseWorkflowDurationToMs("PT10M")).toBe(600_000);
    expect(parseWorkflowDurationToMs("PT1S")).toBe(1_000);
  });

  test("parses combined ISO date + time durations", () => {
    expect(parseWorkflowDurationToMs("P3DT2H")).toBe(266_400_000);
  });

  test("returns null for invalid or non-positive durations", () => {
    expect(parseWorkflowDurationToMs("abc")).toBeNull();
    expect(parseWorkflowDurationToMs("PT0S")).toBeNull();
  });
});
