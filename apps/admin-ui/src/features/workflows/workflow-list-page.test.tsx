import { describe, expect, test } from "bun:test";
import {
  canManageWorkflowsForRole,
  toLifecycleStatus,
} from "./workflow-list-page";

describe("canManageWorkflowsForRole", () => {
  test("allows owner and admin roles", () => {
    expect(canManageWorkflowsForRole("owner")).toBe(true);
    expect(canManageWorkflowsForRole("admin")).toBe(true);
  });

  test("denies member and missing roles", () => {
    expect(canManageWorkflowsForRole("member")).toBe(false);
    expect(canManageWorkflowsForRole(null)).toBe(false);
    expect(canManageWorkflowsForRole(undefined)).toBe(false);
  });
});

describe("toLifecycleStatus", () => {
  test("maps draft to draft", () => {
    expect(toLifecycleStatus("draft")).toBe("draft");
  });

  test("maps published and paused to published", () => {
    expect(toLifecycleStatus("published")).toBe("published");
    expect(toLifecycleStatus("paused")).toBe("published");
  });
});
