import { describe, expect, test } from "bun:test";
import {
  getRemainingMinimumVisibleMs,
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
