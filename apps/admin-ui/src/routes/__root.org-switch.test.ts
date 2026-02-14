import { describe, expect, test } from "bun:test";
import {
  getHeaderBreadcrumbItems,
  getRemainingMinimumVisibleMs,
  getWorkflowIdFromPathname,
  sanitizeSearchParamsForOrganizationSwitch,
} from "./__root";

describe("sanitizeSearchParamsForOrganizationSwitch", () => {
  test("preserves safe filters and removes organization-bound entity params", () => {
    const sanitized = sanitizeSearchParamsForOrganizationSwitch(
      "?view=schedule&date=2026-02-09&selected=apt-1&tab=details&calendarId=cal-1&clientId=client-1&appointmentTypeId=type-1&listScope=upcoming&tz=America%2FNew_York&create=1",
    );

    expect(new URLSearchParams(sanitized).toString()).toBe(
      "view=schedule&date=2026-02-09&listScope=upcoming&tz=America%2FNew_York",
    );
  });

  test("drops appointment detail state when appointment context is removed", () => {
    const sanitized = sanitizeSearchParamsForOrganizationSwitch(
      "?appointment=appt-123&appointmentTab=history&view=list",
    );

    expect(new URLSearchParams(sanitized).toString()).toBe("view=list");
  });
});

describe("getRemainingMinimumVisibleMs", () => {
  test("returns 0 when loading UI was never shown", () => {
    expect(
      getRemainingMinimumVisibleMs({
        shownAtMs: null,
        nowMs: 500,
        minVisibleMs: 350,
      }),
    ).toBe(0);
  });

  test("returns remaining minimum duration when still within visible window", () => {
    expect(
      getRemainingMinimumVisibleMs({
        shownAtMs: 1_000,
        nowMs: 1_200,
        minVisibleMs: 350,
      }),
    ).toBe(150);
  });

  test("returns 0 once minimum visible window has elapsed", () => {
    expect(
      getRemainingMinimumVisibleMs({
        shownAtMs: 1_000,
        nowMs: 1_500,
        minVisibleMs: 350,
      }),
    ).toBe(0);
  });
});

describe("getWorkflowIdFromPathname", () => {
  test("parses workflow id from detail route", () => {
    expect(getWorkflowIdFromPathname("/workflows/workflow-123")).toBe(
      "workflow-123",
    );
  });

  test("returns null for workflows index route", () => {
    expect(getWorkflowIdFromPathname("/workflows")).toBeNull();
    expect(getWorkflowIdFromPathname("/workflows/")).toBeNull();
  });

  test("returns null for new workflow route", () => {
    expect(getWorkflowIdFromPathname("/workflows/new")).toBeNull();
  });
});

describe("getHeaderBreadcrumbItems", () => {
  test("returns single breadcrumb for top-level clients page", () => {
    expect(getHeaderBreadcrumbItems({ pathname: "/clients" })).toEqual([
      { label: "Clients" },
    ]);
  });

  test("returns fallback workflow detail breadcrumb when name is unavailable", () => {
    expect(
      getHeaderBreadcrumbItems({
        pathname: "/workflows/workflow-123",
      }),
    ).toEqual([
      { label: "Workflows", to: "/workflows" },
      { label: "Workflow" },
    ]);
  });

  test("uses workflow name in workflow detail breadcrumb", () => {
    expect(
      getHeaderBreadcrumbItems({
        pathname: "/workflows/workflow-123",
        workflowName: "Data Fetching",
      }),
    ).toEqual([
      { label: "Workflows", to: "/workflows" },
      { label: "Data Fetching" },
    ]);
  });

  test("returns settings section breadcrumb for explicit section", () => {
    expect(
      getHeaderBreadcrumbItems({
        pathname: "/settings",
        searchStr: "?section=webhooks",
      }),
    ).toEqual([{ label: "Settings", to: "/settings" }, { label: "Webhooks" }]);
  });

  test("returns settings section breadcrumb for default section", () => {
    expect(
      getHeaderBreadcrumbItems({
        pathname: "/settings",
        searchStr: "",
      }),
    ).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "Organization" },
    ]);
  });

  test("maps legacy settings aliases to organization section", () => {
    expect(
      getHeaderBreadcrumbItems({
        pathname: "/settings",
        searchStr: "?section=scheduling",
      }),
    ).toEqual([
      { label: "Settings", to: "/settings" },
      { label: "Organization" },
    ]);
  });
});
