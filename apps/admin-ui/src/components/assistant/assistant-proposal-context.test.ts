import { afterEach, describe, expect, test } from "bun:test";
import {
  buildProposalStorageKey,
  clearProposalResults,
  isAssistantActionResult,
  loadProposalResults,
} from "./assistant-proposal-context";

describe("buildProposalStorageKey", () => {
  test("builds key from orgId and userId", () => {
    const key = buildProposalStorageKey("org-1", "user-1");
    expect(key).toBe("assistant-proposals:v1:org-1:user-1");
  });

  test("returns null when orgId is null", () => {
    expect(buildProposalStorageKey(null, "user-1")).toBeNull();
  });

  test("returns null when userId is null", () => {
    expect(buildProposalStorageKey("org-1", null)).toBeNull();
  });

  test("returns null when both are null", () => {
    expect(buildProposalStorageKey(null, null)).toBeNull();
  });
});

describe("isAssistantActionResult", () => {
  test("accepts valid action result", () => {
    expect(
      isAssistantActionResult({
        proposalId: "p-1",
        actionType: "book",
        success: true,
        message: "Done",
      }),
    ).toBe(true);
  });

  test("accepts result with entityId", () => {
    expect(
      isAssistantActionResult({
        proposalId: "p-1",
        actionType: "confirm",
        success: true,
        message: "Confirmed",
        entityId: "uuid-1",
      }),
    ).toBe(true);
  });

  test("rejects null", () => {
    expect(isAssistantActionResult(null)).toBe(false);
  });

  test("rejects primitive values", () => {
    expect(isAssistantActionResult("string")).toBe(false);
    expect(isAssistantActionResult(42)).toBe(false);
    expect(isAssistantActionResult(undefined)).toBe(false);
  });

  test("rejects when proposalId is missing", () => {
    expect(
      isAssistantActionResult({
        actionType: "book",
        success: true,
        message: "Done",
      }),
    ).toBe(false);
  });

  test("rejects when actionType is missing", () => {
    expect(
      isAssistantActionResult({
        proposalId: "p-1",
        success: true,
        message: "Done",
      }),
    ).toBe(false);
  });

  test("rejects when success is not boolean", () => {
    expect(
      isAssistantActionResult({
        proposalId: "p-1",
        actionType: "book",
        success: "yes",
        message: "Done",
      }),
    ).toBe(false);
  });

  test("rejects when message is missing", () => {
    expect(
      isAssistantActionResult({
        proposalId: "p-1",
        actionType: "book",
        success: true,
      }),
    ).toBe(false);
  });
});

describe("loadProposalResults", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  test("returns empty record when nothing is stored", () => {
    expect(loadProposalResults("org-1", "user-1")).toEqual({});
  });

  test("returns empty record when orgId is null", () => {
    expect(loadProposalResults(null, "user-1")).toEqual({});
  });

  test("returns empty record when userId is null", () => {
    expect(loadProposalResults("org-1", null)).toEqual({});
  });

  test("loads valid results from sessionStorage", () => {
    const key = "assistant-proposals:v1:org-1:user-1";
    const results = {
      "p-1": {
        proposalId: "p-1",
        actionType: "book" as const,
        success: true,
        message: "Booked",
      },
    };
    sessionStorage.setItem(key, JSON.stringify(results));
    const loaded = loadProposalResults("org-1", "user-1");
    expect(loaded).toEqual(results);
  });

  test("skips invalid entries", () => {
    const key = "assistant-proposals:v1:org-1:user-1";
    const results = {
      "p-1": {
        proposalId: "p-1",
        actionType: "book",
        success: true,
        message: "Booked",
      },
      "p-2": { invalid: true },
    };
    sessionStorage.setItem(key, JSON.stringify(results));
    const loaded = loadProposalResults("org-1", "user-1");
    expect(Object.keys(loaded)).toHaveLength(1);
    expect(loaded["p-1"]).toBeDefined();
  });

  test("returns empty record for corrupted JSON", () => {
    const key = "assistant-proposals:v1:org-1:user-1";
    sessionStorage.setItem(key, "{broken");
    expect(loadProposalResults("org-1", "user-1")).toEqual({});
  });

  test("returns empty record for non-object stored data", () => {
    const key = "assistant-proposals:v1:org-1:user-1";
    sessionStorage.setItem(key, JSON.stringify("not an object"));
    expect(loadProposalResults("org-1", "user-1")).toEqual({});
  });
});

describe("clearProposalResults", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  test("removes stored proposal results", () => {
    const key = "assistant-proposals:v1:org-1:user-1";
    sessionStorage.setItem(
      key,
      JSON.stringify({
        "p-1": {
          proposalId: "p-1",
          actionType: "book",
          success: true,
          message: "OK",
        },
      }),
    );
    clearProposalResults({ orgId: "org-1", userId: "user-1" });
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  test("does nothing when orgId is null", () => {
    clearProposalResults({ orgId: null, userId: "user-1" });
    // No error thrown
  });

  test("does nothing when userId is null", () => {
    clearProposalResults({ orgId: "org-1", userId: null });
    // No error thrown
  });

  test("does nothing when nothing is stored", () => {
    clearProposalResults({ orgId: "org-1", userId: "user-1" });
    // No error thrown
  });
});
