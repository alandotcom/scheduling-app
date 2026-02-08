import { afterEach, describe, expect, test, mock } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactElement } from "react";

import { createAppointmentFixture, createTestQueryClient } from "@/test-utils";
import { AppointmentDetail } from "./appointment-detail";

function renderWithQuery(ui: ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("AppointmentDetail", () => {
  test("shows notes as always-editable for actionable appointments", () => {
    const appointment = createAppointmentFixture({
      status: "scheduled",
      notes: null,
    });

    const { container } = renderWithQuery(
      <AppointmentDetail
        appointment={appointment}
        displayTimezone="America/New_York"
        timezoneMode="calendar"
        onTimezoneModeChange={() => {}}
        activeTab="details"
        onTabChange={() => {}}
      />,
    );

    expect(container.querySelector("textarea")).not.toBeNull();
    expect(container.textContent).toContain("Save");
    expect(container.textContent).not.toContain("Edit");
  });

  test("uses clickable client row instead of separate profile button", () => {
    const appointment = createAppointmentFixture();
    const onOpenClient = mock(() => {});

    const { container } = renderWithQuery(
      <AppointmentDetail
        appointment={appointment}
        displayTimezone="America/New_York"
        timezoneMode="calendar"
        onTimezoneModeChange={() => {}}
        activeTab="client"
        onTabChange={() => {}}
        onOpenClient={onOpenClient}
      />,
    );

    expect(container.textContent).not.toContain("View Client Profile");

    const clientButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Open client"),
    );
    expect(clientButton).not.toBeNull();
    fireEvent.click(clientButton as HTMLButtonElement);

    expect(onOpenClient).toHaveBeenCalledWith("test-client-id");
  });
});
