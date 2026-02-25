import { describe, expect, test } from "bun:test";
import {
  buildStorageKey,
  isRecord,
  isUIMessage,
} from "./use-assistant-session-history";

describe("buildStorageKey", () => {
  test("builds key from orgId and userId", () => {
    const key = buildStorageKey({ orgId: "org-1", userId: "user-1" });
    expect(key).toBe("assistant-chat:v1:org-1:user-1");
  });

  test("returns null when orgId is null", () => {
    expect(buildStorageKey({ orgId: null, userId: "user-1" })).toBeNull();
  });

  test("returns null when userId is null", () => {
    expect(buildStorageKey({ orgId: "org-1", userId: null })).toBeNull();
  });

  test("returns null when both are null", () => {
    expect(buildStorageKey({ orgId: null, userId: null })).toBeNull();
  });
});

describe("isRecord", () => {
  test("returns true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ key: "value" })).toBe(true);
  });

  test("returns false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  test("returns false for primitives", () => {
    expect(isRecord("string")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });

  test("returns true for arrays (they are objects)", () => {
    expect(isRecord([])).toBe(true);
  });
});

describe("isUIMessage", () => {
  test("accepts valid UIMessage shape", () => {
    expect(
      isUIMessage({
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
      }),
    ).toBe(true);
  });

  test("accepts assistant message with empty parts", () => {
    expect(
      isUIMessage({
        id: "msg-2",
        role: "assistant",
        parts: [],
      }),
    ).toBe(true);
  });

  test("rejects when id is missing", () => {
    expect(isUIMessage({ role: "user", parts: [] })).toBe(false);
  });

  test("rejects when role is missing", () => {
    expect(isUIMessage({ id: "msg-1", parts: [] })).toBe(false);
  });

  test("rejects when parts is not an array", () => {
    expect(isUIMessage({ id: "msg-1", role: "user", parts: "not-array" })).toBe(
      false,
    );
  });

  test("rejects null", () => {
    expect(isUIMessage(null)).toBe(false);
  });

  test("rejects non-object values", () => {
    expect(isUIMessage("string")).toBe(false);
    expect(isUIMessage(42)).toBe(false);
    expect(isUIMessage(undefined)).toBe(false);
  });

  test("rejects when id is non-string", () => {
    expect(isUIMessage({ id: 123, role: "user", parts: [] })).toBe(false);
  });

  test("rejects when role is non-string", () => {
    expect(isUIMessage({ id: "msg-1", role: 0, parts: [] })).toBe(false);
  });
});
