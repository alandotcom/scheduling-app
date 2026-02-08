import { describe, expect, test } from "bun:test";
import { getOrganizationGateState } from "./__root";

describe("getOrganizationGateState", () => {
  test("returns loading while organizations are pending", () => {
    const state = getOrganizationGateState({
      isOrganizationsPending: true,
      organizationsError: null,
      activeOrganizationId: null,
      hasValidActiveOrganization: false,
    });

    expect(state).toBe("loading");
  });

  test("returns selection when authenticated user has no active organization", () => {
    const state = getOrganizationGateState({
      isOrganizationsPending: false,
      organizationsError: null,
      activeOrganizationId: null,
      hasValidActiveOrganization: false,
    });

    expect(state).toBe("selection");
  });

  test("returns loading when active organization id exists but is unresolved", () => {
    const state = getOrganizationGateState({
      isOrganizationsPending: false,
      organizationsError: null,
      activeOrganizationId: "org-123",
      hasValidActiveOrganization: false,
    });

    expect(state).toBe("loading");
  });

  test("returns error when organizations request fails", () => {
    const state = getOrganizationGateState({
      isOrganizationsPending: false,
      organizationsError: new Error("Failed to load organizations."),
      activeOrganizationId: "org-123",
      hasValidActiveOrganization: false,
    });

    expect(state).toBe("error");
  });

  test("returns ready when active organization is valid", () => {
    const state = getOrganizationGateState({
      isOrganizationsPending: false,
      organizationsError: null,
      activeOrganizationId: "org-123",
      hasValidActiveOrganization: true,
    });

    expect(state).toBe("ready");
  });
});
