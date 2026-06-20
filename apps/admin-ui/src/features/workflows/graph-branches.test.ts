import { describe, expect, test } from "bun:test";
import {
  conditionBranchLabel,
  getConditionBranch,
  getTriggerBranch,
  normalizeConditionBranch,
  normalizeTriggerBranch,
  triggerBranchLabel,
} from "./graph-branches";

describe("normalizeConditionBranch", () => {
  test("accepts true/false", () => {
    expect(normalizeConditionBranch("true")).toBe("true");
    expect(normalizeConditionBranch("false")).toBe("false");
  });

  test("strips a leading branch- prefix", () => {
    expect(normalizeConditionBranch("branch-true")).toBe("true");
    expect(normalizeConditionBranch("branch-false")).toBe("false");
  });

  test("trims and lowercases", () => {
    expect(normalizeConditionBranch("  TRUE  ")).toBe("true");
    expect(normalizeConditionBranch("Branch-False")).toBe("false");
  });

  test("returns null for invalid input", () => {
    expect(normalizeConditionBranch("maybe")).toBeNull();
    expect(normalizeConditionBranch("")).toBeNull();
    expect(normalizeConditionBranch(null)).toBeNull();
    expect(normalizeConditionBranch(undefined)).toBeNull();
    expect(normalizeConditionBranch(1)).toBeNull();
  });
});

describe("normalizeTriggerBranch", () => {
  test("accepts the three branch values", () => {
    expect(normalizeTriggerBranch("scheduled")).toBe("scheduled");
    expect(normalizeTriggerBranch("canceled")).toBe("canceled");
    expect(normalizeTriggerBranch("no_show")).toBe("no_show");
  });

  test("normalizes spaces and dashes to underscores", () => {
    expect(normalizeTriggerBranch("no show")).toBe("no_show");
    expect(normalizeTriggerBranch("no-show")).toBe("no_show");
    expect(normalizeTriggerBranch("  No   Show ")).toBe("no_show");
  });

  test("maps the noshow alias", () => {
    expect(normalizeTriggerBranch("noshow")).toBe("no_show");
    expect(normalizeTriggerBranch("NOSHOW")).toBe("no_show");
  });

  test("returns null for invalid input", () => {
    expect(normalizeTriggerBranch("rescheduled")).toBeNull();
    expect(normalizeTriggerBranch("")).toBeNull();
    expect(normalizeTriggerBranch(null)).toBeNull();
    expect(normalizeTriggerBranch(undefined)).toBeNull();
    expect(normalizeTriggerBranch(42)).toBeNull();
  });
});

describe("getConditionBranch", () => {
  test("reads data.conditionBranch first (authoritative)", () => {
    expect(
      getConditionBranch({
        data: { conditionBranch: "false" },
        sourceHandle: "true",
      }),
    ).toBe("false");
  });

  test("falls back to sourceHandle when data is absent", () => {
    expect(getConditionBranch({ sourceHandle: "branch-true" })).toBe("true");
  });

  test("falls back to label between data and sourceHandle", () => {
    expect(getConditionBranch({ label: "False" })).toBe("false");
  });

  test("returns null when nothing carries a branch", () => {
    expect(getConditionBranch({})).toBeNull();
    expect(
      getConditionBranch({ data: { conditionBranch: "nope" }, label: "x" }),
    ).toBeNull();
  });
});

describe("getTriggerBranch", () => {
  test("reads data.triggerBranch first (authoritative)", () => {
    expect(
      getTriggerBranch({
        data: { triggerBranch: "canceled" },
        sourceHandle: "scheduled",
      }),
    ).toBe("canceled");
  });

  test("falls back to sourceHandle when data is absent", () => {
    expect(getTriggerBranch({ sourceHandle: "no-show" })).toBe("no_show");
  });

  test("falls back to label between data and sourceHandle", () => {
    expect(getTriggerBranch({ label: "Scheduled" })).toBe("scheduled");
  });

  test("returns null when nothing carries a branch", () => {
    expect(getTriggerBranch({})).toBeNull();
    expect(
      getTriggerBranch({ data: { triggerBranch: "bogus" }, label: "y" }),
    ).toBeNull();
  });
});

describe("branch labels", () => {
  test("conditionBranchLabel", () => {
    expect(conditionBranchLabel("true")).toBe("True");
    expect(conditionBranchLabel("false")).toBe("False");
  });

  test("triggerBranchLabel", () => {
    expect(triggerBranchLabel("scheduled")).toBe("Scheduled");
    expect(triggerBranchLabel("canceled")).toBe("Canceled");
    expect(triggerBranchLabel("no_show")).toBe("No Show");
  });
});
