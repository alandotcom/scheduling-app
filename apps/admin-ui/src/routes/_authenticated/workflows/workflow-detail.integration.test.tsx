import { describe, expect, test } from "bun:test";

type WorkflowSidebarTabValue = "properties" | "runs";

const isWorkflowSidebarTabValue = (
  value: string,
): value is WorkflowSidebarTabValue =>
  value === "properties" || value === "runs";

const validateSearch = (
  search: Record<string, unknown>,
): {
  sidebarTab?: WorkflowSidebarTabValue;
  runId?: string;
} => {
  const rawSidebarTab =
    typeof search.sidebarTab === "string" ? search.sidebarTab : "";
  const sidebarTab = isWorkflowSidebarTabValue(rawSidebarTab)
    ? rawSidebarTab
    : undefined;
  const runId = typeof search.runId === "string" ? search.runId : undefined;

  return {
    sidebarTab,
    runId,
  };
};

describe("workflow detail route validateSearch", () => {
  test("accepts runs tab with runId", () => {
    const result = validateSearch({
      sidebarTab: "runs",
      runId: "run-123",
    });

    expect(result.sidebarTab).toBe("runs");
    expect(result.runId).toBe("run-123");
  });

  test("accepts properties tab and omits invalid runId", () => {
    const result = validateSearch({
      sidebarTab: "properties",
      runId: 123,
    });

    expect(result.sidebarTab).toBe("properties");
    expect(result.runId).toBeUndefined();
  });

  test("rejects unknown sidebarTab", () => {
    const result = validateSearch({
      sidebarTab: "history",
      runId: "run-456",
    });

    expect(result.sidebarTab).toBeUndefined();
    expect(result.runId).toBe("run-456");
  });
});
