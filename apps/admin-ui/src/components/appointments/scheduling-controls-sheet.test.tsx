import { afterEach, describe, expect, test, mock } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import { SchedulingControlsSheet } from "@/components/appointments/scheduling-controls-sheet";

afterEach(() => {
  cleanup();
});

describe("SchedulingControlsSheet", () => {
  const baseProps = {
    open: true,
    onOpenChange: mock(() => {}),
    listScope: "upcoming" as const,
    onListScopeChange: mock(() => {}),
    timezoneMode: "calendar" as const,
    onTimezoneModeChange: mock(() => {}),
    displayTimezone: "America/New_York",
    displayTimezoneShort: "EST",
    onTimezoneChange: mock(() => {}),
    filters: {
      calendarId: "",
      appointmentTypeId: "",
      status: "",
    },
    onFilterChange: mock(() => {}),
    calendars: [{ id: "cal-1", name: "Dr. Smith" }],
    appointmentTypes: [{ id: "type-1", name: "Initial Consultation" }],
    calendarFilterLabel: "All calendars",
    typeFilterLabel: "All types",
    statusFilterLabel: "All statuses",
    activeFilterCount: 0,
    activeFiltersDisplay: [],
    onClearAllFilters: mock(() => {}),
  };

  test("shows list scope controls when current view is list", () => {
    render(<SchedulingControlsSheet {...baseProps} currentView="list" />);

    expect(screen.getByText("List Scope")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upcoming" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "History" })).toBeTruthy();
  });

  test("hides list scope controls when current view is schedule", () => {
    render(<SchedulingControlsSheet {...baseProps} currentView="schedule" />);

    expect(screen.queryByText("List Scope")).toBeNull();
    expect(screen.getByText("Filters")).toBeTruthy();
    expect(screen.getByText("Timezone")).toBeTruthy();
  });
});
