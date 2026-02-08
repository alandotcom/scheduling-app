import { afterEach, describe, expect, test, mock } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { DateTime } from "luxon";

import { AvailabilityCalendarPicker } from "@/components/appointments/availability-calendar-picker";

afterEach(() => {
  cleanup();
});

describe("AvailabilityCalendarPicker", () => {
  test("keeps time slots in parent scroll on mobile and constrains only on desktop", () => {
    const selectedDate = DateTime.fromISO("2026-01-10T00:00:00", {
      zone: "America/New_York",
    });

    render(
      <AvailabilityCalendarPicker
        viewMonth={selectedDate.startOf("month")}
        onViewMonthChange={mock(() => {})}
        selectedDate={selectedDate}
        onSelectDate={mock(() => {})}
        selectedTime={null}
        onSelectTime={mock(() => {})}
        monthSlots={[
          { start: "2026-01-10T09:00:00-05:00", available: true },
          { start: "2026-01-10T09:15:00-05:00", available: true },
        ]}
        slotsLoading={false}
        schedulingTimezone="America/New_York"
        displayTimezone="America/New_York"
      />,
    );

    const timeButton = screen.getByRole("button", { name: /9:00 AM/i });
    const grid = timeButton.closest("div");

    expect(grid?.className).toContain("md:max-h-64");
    expect(grid?.className).toContain("md:overflow-y-auto");
    expect(grid?.className).not.toContain("max-h-64 overflow-y-auto");
  });
});
