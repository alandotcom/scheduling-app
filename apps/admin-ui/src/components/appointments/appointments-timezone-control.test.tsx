import { afterEach, describe, expect, test, mock } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { AppointmentsTimezoneControl } from "./appointments-timezone-control";

afterEach(() => {
  cleanup();
});

describe("AppointmentsTimezoneControl", () => {
  test("renders editable timezone select in calendar mode without selected calendar", () => {
    const onTimezoneChange = mock(() => {});
    const { container } = render(
      <AppointmentsTimezoneControl
        timezoneMode="calendar"
        displayTimezone="America/New_York"
        displayTimezoneShort="EST"
        onTimezoneChange={onTimezoneChange}
      />,
    );

    const trigger = container.querySelector("[data-slot='select-trigger']");
    expect(trigger).not.toBeNull();
    expect(container.textContent).toContain("America/New York");
  });

  test("renders read-only my time in viewer mode", () => {
    const onTimezoneChange = mock(() => {});
    const { container } = render(
      <AppointmentsTimezoneControl
        timezoneMode="viewer"
        displayTimezone="America/Los_Angeles"
        displayTimezoneShort="PST"
        onTimezoneChange={onTimezoneChange}
      />,
    );

    expect(container.textContent).toContain("My time");
    expect(container.textContent).toContain("PST");
    expect(container.textContent).not.toContain("America/Los_Angeles");
    expect(container.querySelector("[data-slot='select-trigger']")).toBeNull();
  });

  test("renders read-only calendar timezone when a calendar is selected", () => {
    const onTimezoneChange = mock(() => {});
    const { container } = render(
      <AppointmentsTimezoneControl
        timezoneMode="calendar"
        displayTimezone="America/New_York"
        displayTimezoneShort="EST"
        selectedCalendarTimezone="America/New_York"
        onTimezoneChange={onTimezoneChange}
      />,
    );

    expect(container.textContent).toContain("Calendar timezone");
    expect(container.textContent).toContain("EST");
    expect(container.textContent).not.toContain("America/New_York");
    expect(container.querySelector("[data-slot='select-trigger']")).toBeNull();
  });
});
