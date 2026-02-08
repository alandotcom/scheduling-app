import { describe, expect, test, mock } from "bun:test";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { AppointmentsTimezoneControl } from "./appointments-timezone-control";

function render(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(ui);
  });

  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  return { container, unmount };
}

describe("AppointmentsTimezoneControl", () => {
  test("renders editable timezone select in calendar mode without selected calendar", () => {
    const onTimezoneChange = mock(() => {});
    const { container, unmount } = render(
      <AppointmentsTimezoneControl
        timezoneMode="calendar"
        displayTimezone="America/New_York"
        displayTimezoneShort="EST"
        onTimezoneChange={onTimezoneChange}
      />,
    );

    const trigger = container.querySelector("[data-slot='select-trigger']");
    expect(trigger).not.toBeNull();
    expect(container.textContent).toContain("America/New_York");

    unmount();
  });

  test("renders read-only my time in viewer mode", () => {
    const onTimezoneChange = mock(() => {});
    const { container, unmount } = render(
      <AppointmentsTimezoneControl
        timezoneMode="viewer"
        displayTimezone="America/Los_Angeles"
        displayTimezoneShort="PST"
        onTimezoneChange={onTimezoneChange}
      />,
    );

    expect(container.textContent).toContain("My time");
    expect(container.textContent).toContain("America/Los_Angeles");
    expect(container.textContent).toContain("(PST)");
    expect(container.querySelector("[data-slot='select-trigger']")).toBeNull();

    unmount();
  });

  test("renders read-only calendar timezone when a calendar is selected", () => {
    const onTimezoneChange = mock(() => {});
    const { container, unmount } = render(
      <AppointmentsTimezoneControl
        timezoneMode="calendar"
        displayTimezone="America/New_York"
        displayTimezoneShort="EST"
        selectedCalendarTimezone="America/New_York"
        onTimezoneChange={onTimezoneChange}
      />,
    );

    expect(container.textContent).toContain("Calendar timezone");
    expect(container.textContent).toContain("America/New_York");
    expect(container.textContent).toContain("(EST)");
    expect(container.querySelector("[data-slot='select-trigger']")).toBeNull();

    unmount();
  });
});
