import { describe, expect, test, mock } from "bun:test";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import { createAppointmentFixture, createTestQueryClient } from "@/test-utils";
import { AppointmentDetail } from "./appointment-detail";

function render(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );
  });

  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  return { container, unmount };
}

describe("AppointmentDetail", () => {
  test("shows notes as always-editable for actionable appointments", () => {
    const appointment = createAppointmentFixture({
      status: "scheduled",
      notes: null,
    });

    const { container, unmount } = render(
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

    unmount();
  });

  test("uses clickable client row instead of separate profile button", () => {
    const appointment = createAppointmentFixture();
    const onOpenClient = mock(() => {});

    const { container, unmount } = render(
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
    act(() => {
      clientButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenClient).toHaveBeenCalledWith("test-client-id");
    unmount();
  });
});
