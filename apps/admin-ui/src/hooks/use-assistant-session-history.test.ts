import { afterEach, describe, expect, test } from "bun:test";
import {
  buildStorageKey,
  clearSessionHistory,
  convertPartToUIFormat,
  hasSessionHistory,
  isRecord,
  isUIMessage,
  loadSessionHistory,
  toStorableUIMessage,
} from "./assistant-session-storage";

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

// ---------- convertPartToUIFormat ----------

describe("convertPartToUIFormat", () => {
  test("converts text part", () => {
    const result = convertPartToUIFormat({ type: "text", text: "Hello" });
    expect(result).toEqual({ type: "text", text: "Hello" });
  });

  test("converts tool-call with result to output-available", () => {
    const result = convertPartToUIFormat({
      type: "tool-call",
      toolName: "findClients",
      toolCallId: "tc-1",
      args: { query: "Ada" },
      result: { rows: [] },
    });
    expect(result).toEqual({
      type: "tool-findClients",
      toolCallId: "tc-1",
      toolName: "findClients",
      input: { query: "Ada" },
      state: "output-available",
      output: { rows: [] },
    });
  });

  test("converts tool-call without result to input-available", () => {
    const result = convertPartToUIFormat({
      type: "tool-call",
      toolName: "findClients",
      toolCallId: "tc-1",
      args: { query: "Ada" },
    });
    expect(result).toEqual({
      type: "tool-findClients",
      toolCallId: "tc-1",
      toolName: "findClients",
      input: { query: "Ada" },
      state: "input-available",
    });
  });

  test("converts tool-call error to output-error", () => {
    const result = convertPartToUIFormat({
      type: "tool-call",
      toolName: "findClients",
      toolCallId: "tc-1",
      args: {},
      result: "Something went wrong",
      isError: true,
    });
    expect(result).toEqual({
      type: "tool-findClients",
      toolCallId: "tc-1",
      toolName: "findClients",
      input: {},
      state: "output-error",
      errorText: "Something went wrong",
    });
  });

  test("converts tool-call error with non-string result", () => {
    const result = convertPartToUIFormat({
      type: "tool-call",
      toolName: "findClients",
      toolCallId: "tc-1",
      args: {},
      result: { code: 500 },
      isError: true,
    });
    expect(result).toMatchObject({
      state: "output-error",
      errorText: '{"code":500}',
    });
  });

  test("defaults args to empty object when missing", () => {
    const result = convertPartToUIFormat({
      type: "tool-call",
      toolName: "findClients",
      toolCallId: "tc-1",
    });
    expect(result).toMatchObject({ input: {} });
  });

  test("passes through unknown part types as-is", () => {
    const part = { type: "reasoning", text: "thinking..." };
    const result = convertPartToUIFormat(part);
    expect(result).toEqual(part);
  });
});

// ---------- toStorableUIMessage ----------

describe("toStorableUIMessage", () => {
  test("converts valid user message", () => {
    const msg = {
      id: "msg-1",
      role: "user",
      content: [{ type: "text", text: "Hello" }],
    };
    const result = toStorableUIMessage(msg);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("msg-1");
    expect(result!.role).toBe("user");
    expect(result!.parts).toHaveLength(1);
  });

  test("converts valid assistant message with tool calls", () => {
    const msg = {
      id: "msg-2",
      role: "assistant",
      content: [
        { type: "text", text: "Found results" },
        {
          type: "tool-call",
          toolName: "findClients",
          toolCallId: "tc-1",
          args: { query: "Ada" },
          result: { rows: [] },
        },
      ],
    };
    const result = toStorableUIMessage(msg);
    expect(result).not.toBeNull();
    expect(result!.parts).toHaveLength(2);
  });

  test("prefers content over parts", () => {
    const msg = {
      id: "msg-1",
      role: "user",
      content: [{ type: "text", text: "from content" }],
      parts: [{ type: "text", text: "from parts" }],
    };
    const result = toStorableUIMessage(msg);
    expect(result).not.toBeNull();
    const textPart = result!.parts[0] as { type: string; text: string };
    expect(textPart.text).toBe("from content");
  });

  test("falls back to parts when content is missing", () => {
    const msg = {
      id: "msg-1",
      role: "user",
      parts: [{ type: "text", text: "from parts" }],
    };
    const result = toStorableUIMessage(msg);
    expect(result).not.toBeNull();
  });

  test("returns null for non-object input", () => {
    expect(toStorableUIMessage("not an object")).toBeNull();
    expect(toStorableUIMessage(null)).toBeNull();
    expect(toStorableUIMessage(42)).toBeNull();
  });

  test("returns null when id is missing", () => {
    expect(
      toStorableUIMessage({
        role: "user",
        content: [{ type: "text", text: "hi" }],
      }),
    ).toBeNull();
  });

  test("returns null when role is missing", () => {
    expect(
      toStorableUIMessage({
        id: "msg-1",
        content: [{ type: "text", text: "hi" }],
      }),
    ).toBeNull();
  });

  test("returns null for invalid role", () => {
    expect(
      toStorableUIMessage({
        id: "msg-1",
        role: "tool",
        content: [{ type: "text", text: "hi" }],
      }),
    ).toBeNull();
  });

  test("returns null when neither content nor parts is an array", () => {
    expect(
      toStorableUIMessage({ id: "msg-1", role: "user", content: "not array" }),
    ).toBeNull();
  });

  test("filters out non-record parts", () => {
    const msg = {
      id: "msg-1",
      role: "user",
      content: [{ type: "text", text: "keep" }, "skip-this", 42, null],
    };
    const result = toStorableUIMessage(msg);
    expect(result).not.toBeNull();
    expect(result!.parts).toHaveLength(1);
  });
});

// ---------- Session history storage functions ----------

describe("hasSessionHistory", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  test("returns false when nothing is stored", () => {
    expect(hasSessionHistory({ orgId: "org-1", userId: "user-1" })).toBe(false);
  });

  test("returns false when orgId is null", () => {
    expect(hasSessionHistory({ orgId: null, userId: "user-1" })).toBe(false);
  });

  test("returns true when valid data is stored", () => {
    const key = "assistant-chat:v1:org-1:user-1";
    sessionStorage.setItem(
      key,
      JSON.stringify([{ id: "msg-1", role: "user", parts: [] }]),
    );
    expect(hasSessionHistory({ orgId: "org-1", userId: "user-1" })).toBe(true);
  });

  test("returns false when stored data is empty array", () => {
    const key = "assistant-chat:v1:org-1:user-1";
    sessionStorage.setItem(key, JSON.stringify([]));
    expect(hasSessionHistory({ orgId: "org-1", userId: "user-1" })).toBe(false);
  });

  test("returns false when stored data is invalid JSON", () => {
    const key = "assistant-chat:v1:org-1:user-1";
    sessionStorage.setItem(key, "not json");
    expect(hasSessionHistory({ orgId: "org-1", userId: "user-1" })).toBe(false);
  });
});

describe("clearSessionHistory", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  test("removes stored history", () => {
    const key = "assistant-chat:v1:org-1:user-1";
    sessionStorage.setItem(
      key,
      JSON.stringify([{ id: "msg-1", role: "user", parts: [] }]),
    );
    clearSessionHistory({ orgId: "org-1", userId: "user-1" });
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  test("does nothing when orgId is null", () => {
    clearSessionHistory({ orgId: null, userId: "user-1" });
    // No error thrown
  });

  test("does nothing when nothing is stored", () => {
    clearSessionHistory({ orgId: "org-1", userId: "user-1" });
    // No error thrown
  });
});

describe("loadSessionHistory", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  test("returns undefined when nothing is stored", () => {
    expect(
      loadSessionHistory({ orgId: "org-1", userId: "user-1" }),
    ).toBeUndefined();
  });

  test("returns undefined when orgId is null", () => {
    expect(
      loadSessionHistory({ orgId: null, userId: "user-1" }),
    ).toBeUndefined();
  });

  test("returns messages when valid data is stored", () => {
    const key = "assistant-chat:v1:org-1:user-1";
    const messages = [
      { id: "msg-1", role: "user", parts: [{ type: "text", text: "Hi" }] },
      {
        id: "msg-2",
        role: "assistant",
        parts: [{ type: "text", text: "Hello" }],
      },
    ];
    sessionStorage.setItem(key, JSON.stringify(messages));
    const result = loadSessionHistory({ orgId: "org-1", userId: "user-1" });
    expect(result).toBeDefined();
    expect(result).toHaveLength(2);
    expect(result?.[0]?.id).toBe("msg-1");
  });

  test("returns undefined when stored data has invalid messages", () => {
    const key = "assistant-chat:v1:org-1:user-1";
    sessionStorage.setItem(key, JSON.stringify([{ invalid: true }]));
    expect(
      loadSessionHistory({ orgId: "org-1", userId: "user-1" }),
    ).toBeUndefined();
  });

  test("returns undefined when stored data is not an array", () => {
    const key = "assistant-chat:v1:org-1:user-1";
    sessionStorage.setItem(key, JSON.stringify({ not: "array" }));
    expect(
      loadSessionHistory({ orgId: "org-1", userId: "user-1" }),
    ).toBeUndefined();
  });

  test("returns undefined for corrupted JSON", () => {
    const key = "assistant-chat:v1:org-1:user-1";
    sessionStorage.setItem(key, "{broken json");
    expect(
      loadSessionHistory({ orgId: "org-1", userId: "user-1" }),
    ).toBeUndefined();
  });
});
