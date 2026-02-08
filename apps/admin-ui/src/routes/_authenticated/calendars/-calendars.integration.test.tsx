/// <reference lib="dom" />

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { waitFor } from "@testing-library/dom";
import { AvailabilitySubTabs } from "@/components/availability/availability-sub-tabs";
import { CompactBlockedTimeEditor } from "@/components/availability/blocked-time-editor";
import { CompactDateOverridesEditor } from "@/components/availability/date-overrides-editor";
import { CompactWeeklyScheduleEditor } from "@/components/availability/weekly-schedule-editor";
import type { AvailabilitySubTabType } from "@/components/availability/constants";
import {
  createAvailabilityRuleFixture,
  createTestQueryClient,
  setMockAvailabilityRules,
  setMockBlockedTimes,
  setMockDateOverrides,
} from "@/test-utils";

type Cleanup = () => void;

let cleanup: Cleanup | null = null;

function AvailabilityHarness({
  calendarId,
  timezone,
}: {
  calendarId: string;
  timezone: string;
}) {
  const [tab, setTab] = useState<AvailabilitySubTabType>("weekly");

  return (
    <div>
      <AvailabilitySubTabs value={tab} onChange={setTab} />
      {tab === "weekly" && (
        <CompactWeeklyScheduleEditor
          calendarId={calendarId}
          timezone={timezone}
        />
      )}
      {tab === "overrides" && (
        <CompactDateOverridesEditor
          calendarId={calendarId}
          timezone={timezone}
        />
      )}
      {tab === "blocked" && (
        <CompactBlockedTimeEditor calendarId={calendarId} timezone={timezone} />
      )}
    </div>
  );
}

async function renderAvailabilityHarness() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = createTestQueryClient();

  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <AvailabilityHarness calendarId="cal-1" timezone="America/New_York" />
      </QueryClientProvider>,
    );
    await Promise.resolve();
  });

  cleanup = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
}

async function clickButtonByText(label: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (el) => el.textContent?.trim() === label,
  );
  expect(button).toBeDefined();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
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
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = "";
  });

  test("renders availability tabs with weekly editor by default", async () => {
    await renderAvailabilityHarness();

    await waitFor(() => {
      expect(document.body.textContent).toContain("Weekly Schedule");
      expect(document.body.textContent).toContain("Date Overrides");
      expect(document.body.textContent).toContain("Blocked Time");
    });

    await waitFor(() => {
      expect(document.body.textContent).toContain("Mon");
    });
  });

  test("switches between weekly, overrides, and blocked editors", async () => {
    await renderAvailabilityHarness();

    await waitFor(() => {
      expect(document.body.textContent).toContain("Weekly Schedule");
    });

    await clickButtonByText("Date Overrides");
    await waitFor(() => {
      expect(document.body.textContent).toContain(
        "No upcoming overrides configured.",
      );
    });

    await clickButtonByText("Blocked Time");
    await waitFor(() => {
      expect(document.body.textContent).toContain(
        "No blocked time configured.",
      );
    });
  });
});
