import { describe, expect, test } from "bun:test";
import { isExpectedAuthTransitionErrorPayload } from "./api";

describe("isExpectedAuthTransitionErrorPayload", () => {
  test("matches authentication required 401 payloads", () => {
    expect(
      isExpectedAuthTransitionErrorPayload(401, {
        error: { message: "Authentication required" },
      }),
    ).toBe(true);
  });

  test("matches active organization required 401 payloads", () => {
    expect(
      isExpectedAuthTransitionErrorPayload(401, {
        error: { message: "UNAUTHORIZED: Active organization required" },
      }),
    ).toBe(true);
  });

  test("does not match unrelated 401 payloads", () => {
    expect(
      isExpectedAuthTransitionErrorPayload(401, {
        error: { message: "Invalid API key" },
      }),
    ).toBe(false);
  });

  test("does not match non-401 responses", () => {
    expect(
      isExpectedAuthTransitionErrorPayload(500, {
        error: { message: "Authentication required" },
      }),
    ).toBe(false);
  });

  test("does not match malformed payloads", () => {
    expect(isExpectedAuthTransitionErrorPayload(401, null)).toBe(false);
    expect(isExpectedAuthTransitionErrorPayload(401, {})).toBe(false);
  });
});
