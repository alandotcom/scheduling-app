import { describe, expect, test } from "bun:test";
import { canManageWorkflowsForRole } from "./workflow-list-page";

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
