/// <reference lib="dom" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AvailabilitySubTabs } from "@/components/availability/availability-sub-tabs";
import { CompactBlockedTimeEditor } from "@/components/availability/blocked-time-editor";
import { CalendarSchedulingLimitsEditor } from "@/components/availability/scheduling-limits-editor";
import { CompactWeeklyScheduleEditor } from "@/components/availability/weekly-schedule-editor";
import type { AvailabilitySubTabType } from "@/components/availability/constants";
import {
  createAvailabilityRuleFixture,
  createTestQueryClient,
  setMockAvailabilityRules,
  setMockBlockedTimes,
  setMockDateOverrides,
} from "@/test-utils";

function AvailabilityHarness({
  calendarId,
  timezone,
}: {
  calendarId: string;
  timezone: string;
}) {
  const [tab, setTab] =
    useState<Exclude<AvailabilitySubTabType, "overrides">>("weekly");

  return (
    <div>
      <AvailabilitySubTabs
        value={tab}
        onChange={(nextTab) => {
          if (nextTab === "overrides") return;
          setTab(nextTab);
        }}
        includeOverrides={false}
      />
      {tab === "weekly" && (
        <CompactWeeklyScheduleEditor
          calendarId={calendarId}
          timezone={timezone}
        />
      )}
      {tab === "blocked" && (
        <CompactBlockedTimeEditor calendarId={calendarId} timezone={timezone} />
      )}
      {tab === "limits" && (
        <CalendarSchedulingLimitsEditor calendarId={calendarId} compact />
      )}
    </div>
  );
}

function renderAvailabilityHarness() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AvailabilityHarness calendarId="cal-1" timezone="America/New_York" />
    </QueryClientProvider>,
  );
}

describe("calendars route validateSearch", () => {
  type DetailTabValue = "details" | "availability" | "appointments";
  const isDetailTab = (value: string): value is DetailTabValue =>
    value === "details" || value === "availability" || value === "appointments";

  const validateSearch = (
    search: Record<string, unknown>,
  ): { selected?: string; tab?: DetailTabValue } => {
    const selected =
      typeof search.selected === "string" ? search.selected : undefined;
    const rawTab = typeof search.tab === "string" ? search.tab : "";
    const tab = isDetailTab(rawTab) ? rawTab : undefined;
    return { selected, tab };
  };

  test("accepts selected and known tab values", () => {
    const result = validateSearch({
      selected: "cal-123",
      tab: "availability",
    });
    expect(result.selected).toBe("cal-123");
    expect(result.tab).toBe("availability");
  });

  test("rejects unknown tab values", () => {
    const result = validateSearch({ selected: "cal-123", tab: "weekly" });
    expect(result.selected).toBe("cal-123");
    expect(result.tab).toBeUndefined();
  });

  test("rejects non-string selected and tab", () => {
    const result = validateSearch({ selected: 123, tab: 456 });
    expect(result.selected).toBeUndefined();
    expect(result.tab).toBeUndefined();
  });
});

describe("calendars availability tab integration", () => {
  beforeEach(() => {
    setMockAvailabilityRules([
      createAvailabilityRuleFixture({
        calendarId: "cal-1",
        weekday: 1,
        startTime: "09:00",
        endTime: "17:00",
      }),
    ]);
    setMockDateOverrides([]);
    setMockBlockedTimes([]);
  });

  afterEach(() => {
    cleanup();
  });

  test("renders availability tabs with weekly editor by default", async () => {
    renderAvailabilityHarness();

    expect(screen.getByText("Weekly Schedule")).toBeTruthy();
    expect(screen.queryByText("Date Overrides")).toBeNull();
    expect(screen.getByText("Blocked Time")).toBeTruthy();
    expect(screen.getByText("Scheduling Limits")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("Mon")).toBeTruthy();
    });
  });

  test("switches between weekly, blocked, and limits editors", async () => {
    renderAvailabilityHarness();

    expect(screen.getByText("Weekly Schedule")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Blocked Time" }));
    await waitFor(() => {
      expect(screen.getByText("No blocked time configured.")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Scheduling Limits" }));
    await waitFor(() => {
      expect(screen.getByText("Scheduling Limits")).toBeTruthy();
    });
  });
});
