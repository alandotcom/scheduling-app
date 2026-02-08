import { describe, expect, test } from "bun:test";
import { formatTimezoneShort } from "./date-utils";

describe("formatTimezoneShort", () => {
  test("returns a compact timezone label", () => {
    const label = formatTimezoneShort(
      "America/Los_Angeles",
      "2026-06-15T12:00:00.000Z",
    );

    expect(label.length > 0).toBe(true);
    expect(label.includes("/")).toBe(false);
  });

  test("supports DST-sensitive output", () => {
    const summer = formatTimezoneShort(
      "America/Los_Angeles",
      "2026-06-15T12:00:00.000Z",
    );
    const winter = formatTimezoneShort(
      "America/Los_Angeles",
      "2026-01-15T12:00:00.000Z",
    );

    expect(summer.length > 0).toBe(true);
    expect(winter.length > 0).toBe(true);
    expect(summer).not.toBe(winter);
  });

  test("falls back to the input when timezone is invalid", () => {
    expect(formatTimezoneShort("Not/A_Timezone")).toBe("Not/A_Timezone");
  });
});
