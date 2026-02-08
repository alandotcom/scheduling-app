import { describe, expect, test } from "bun:test";

import {
  deriveCountryFromPhone,
  formatPhoneForDisplay,
  formatPhoneInputAsYouType,
} from "./phone";

describe("formatPhoneForDisplay", () => {
  test("formats US numbers in hyphen style", () => {
    expect(formatPhoneForDisplay("+14155552671")).toBe("415-555-2671");
  });

  test("formats CA numbers in hyphen style", () => {
    expect(formatPhoneForDisplay("+15145552671")).toBe("514-555-2671");
  });

  test("formats non-NANP numbers as international", () => {
    expect(formatPhoneForDisplay("+447890123456")).toBe("+44 7890 123456");
  });

  test("returns null for empty value", () => {
    expect(formatPhoneForDisplay("")).toBeNull();
    expect(formatPhoneForDisplay(null)).toBeNull();
    expect(formatPhoneForDisplay(undefined)).toBeNull();
  });

  test("returns raw value when not parseable", () => {
    expect(formatPhoneForDisplay("not-a-phone")).toBe("not-a-phone");
  });
});

describe("formatPhoneInputAsYouType", () => {
  test("formats US input with hyphens", () => {
    expect(formatPhoneInputAsYouType("4155552671", "US").formatted).toBe(
      "415-555-2671",
    );
  });

  test("formats +1 input with explicit country code", () => {
    expect(formatPhoneInputAsYouType("+14155552671", "US").formatted).toBe(
      "+1 415-555-2671",
    );
  });

  test("formats international + input", () => {
    const result = formatPhoneInputAsYouType("+447890123456", "US");

    expect(result.formatted).toBe("+44 7890 123456");
    expect(result.detectedCountry).toBe("GB");
  });

  test("formats GB national input without trunk prefix", () => {
    expect(formatPhoneInputAsYouType("2071234567", "GB").formatted).toBe(
      "20 7123 4567",
    );
  });

  test("normalizes punctuation in US input", () => {
    expect(formatPhoneInputAsYouType("415.555.2671", "US").formatted).toBe(
      "415-555-2671",
    );
  });

  test("stops US input when too long", () => {
    expect(formatPhoneInputAsYouType("41555526712345", "US").formatted).toBe(
      "415-555-2671",
    );
  });

  test("keeps GB trunk-prefix formatting", () => {
    expect(formatPhoneInputAsYouType("02071234567", "GB").formatted).toBe(
      "020 7123 4567",
    );
  });

  test("stops GB input when too long", () => {
    expect(formatPhoneInputAsYouType("207123456789", "GB").formatted).toBe(
      "20 7123 4567",
    );
  });

  test("stops + input when too long", () => {
    expect(formatPhoneInputAsYouType("+44207123456789", "GB").formatted).toBe(
      "+44 20 7123 4567",
    );
  });

  test("returns empty string for empty input", () => {
    expect(formatPhoneInputAsYouType("", "US").formatted).toBe("");
  });
});

describe("deriveCountryFromPhone", () => {
  test("returns detected country for valid E.164", () => {
    expect(deriveCountryFromPhone("+447890123456")).toBe("GB");
  });

  test("returns undefined for invalid or empty input", () => {
    expect(deriveCountryFromPhone("invalid")).toBeUndefined();
    expect(deriveCountryFromPhone("")).toBeUndefined();
    expect(deriveCountryFromPhone(undefined)).toBeUndefined();
  });
});
