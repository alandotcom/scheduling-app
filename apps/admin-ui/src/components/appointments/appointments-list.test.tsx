import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { createAppointmentFixture } from "@/test-utils";
import { AppointmentsList } from "./appointments-list";

afterEach(() => {
  cleanup();
});

describe("AppointmentsList", () => {
  test("right-click reschedule action opens reschedule flow for that appointment", () => {
    const appointment = createAppointmentFixture({ status: "scheduled" });
    const onReschedule = mock(() => {});

    const { container } = render(
      <AppointmentsList
        appointments={[appointment]}
        displayTimezone="America/New_York"
        selectedId={null}
        onSelect={() => {}}
        onReschedule={onReschedule}
        onCancel={() => {}}
        onNoShow={() => {}}
      />,
    );

    const row = container.querySelector("tr[aria-selected]");
    expect(row).not.toBeNull();

    if (!row) return;

    fireEvent.contextMenu(row);
    fireEvent.click(screen.getByRole("button", { name: "Reschedule" }));

    expect(onReschedule).toHaveBeenCalledTimes(1);
    expect(onReschedule).toHaveBeenCalledWith(appointment);
  });

  test("right-click menu hides reschedule action for non-actionable appointments", () => {
    const appointment = createAppointmentFixture({ status: "cancelled" });

    const { container } = render(
      <AppointmentsList
        appointments={[appointment]}
        displayTimezone="America/New_York"
        selectedId={null}
        onSelect={() => {}}
        onReschedule={() => {}}
        onCancel={() => {}}
        onNoShow={() => {}}
      />,
    );

    const row = container.querySelector("tr[aria-selected]");
    expect(row).not.toBeNull();

    if (!row) return;

    fireEvent.contextMenu(row);

    expect(screen.queryByRole("button", { name: "Reschedule" })).toBeNull();
    expect(screen.getByRole("button", { name: "View Details" })).toBeDefined();
  });
});
