/// <reference lib="dom" />

import { afterEach, describe, expect, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { createTestQueryClient, createAppointmentFixture } from "@/test-utils";
import { AppointmentModal } from "@/components/appointment-modal";
import { RescheduleDialog } from "@/components/appointments/reschedule-dialog";
import { AvailabilityManageModal } from "@/components/availability/availability-manage-modal";
import { CopyIdHeaderAction } from "@/components/copy-id-header-action";
import { EntityModal } from "@/components/entity-modal";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

afterEach(() => {
  cleanup();
});

function renderWithQuery(ui: ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("modal layout positioning", () => {
  test("EntityModal keeps a top anchor and renders header actions", () => {
    render(
      <EntityModal
        open
        onOpenChange={() => {}}
        title="Entity"
        headerActions={<button type="button">Header Action</button>}
      >
        <div>Entity body</div>
      </EntityModal>,
    );

    const popup = document.querySelector<HTMLElement>(
      '[data-slot="entity-modal-content"]',
    );
    expect(popup).toBeTruthy();
    expect(popup?.className).toContain("inset-0");
    expect(popup?.className).toContain("md:top-8");
    expect(popup?.className).not.toContain("-translate-y-1/2");
    expect(popup?.className).toContain("max-w-4xl");
    expect(document.body.textContent).toContain("Header Action");

    const body = document.querySelector<HTMLElement>(
      '[data-slot="entity-modal-body"]',
    );
    expect(body).toBeTruthy();
    expect(body?.className).toContain("overflow-y-auto");
    expect(body?.className).toContain("p-0");
    expect(body?.className).not.toContain("overflow-hidden");
  });

  test("EntityModal renders copy-id header action", () => {
    render(
      <EntityModal
        open
        onOpenChange={() => {}}
        title="Entity"
        headerActions={
          <CopyIdHeaderAction
            id="018f3f7e-4c83-7e95-8df4-10ccf0f44f45"
            entityLabel="client"
          />
        }
      >
        <div>Entity body</div>
      </EntityModal>,
    );

    const copyButton = document.querySelector<HTMLElement>(
      '[aria-label="Copy client ID"]',
    );
    expect(copyButton).toBeTruthy();
  });

  test("EntityModal renders a dedicated close-button focus target when header actions exist", () => {
    render(
      <EntityModal
        open
        onOpenChange={() => {}}
        title="Entity"
        headerActions={<button type="button">Header Action</button>}
      >
        <div>Entity body</div>
      </EntityModal>,
    );

    const closeButton = document.querySelector<HTMLElement>(
      '[data-slot="entity-modal-close-button"]',
    );
    expect(closeButton).toBeTruthy();
    expect(closeButton?.id).toBeTruthy();
  });

  test("AppointmentModal uses mobile fullscreen layout with desktop top anchor", () => {
    renderWithQuery(<AppointmentModal open onOpenChange={() => {}} />);

    const popup = document.querySelector<HTMLElement>(
      '[data-slot="appointment-modal-content"]',
    );
    expect(popup).toBeTruthy();
    expect(popup?.className).toContain("inset-0");
    expect(popup?.className).toContain("md:top-8");
    expect(popup?.className).not.toContain("-translate-y-1/2");
    expect(popup?.className).toContain("max-w-4xl");
  });

  test("RescheduleDialog uses mobile fullscreen layout with desktop top anchor", () => {
    const appointment = createAppointmentFixture();
    renderWithQuery(
      <RescheduleDialog
        appointment={appointment}
        open
        onOpenChange={() => {}}
      />,
    );

    const popup = document.querySelector<HTMLElement>(
      '[data-slot="reschedule-dialog-content"]',
    );
    expect(popup).toBeTruthy();
    expect(popup?.className).toContain("inset-0");
    expect(popup?.className).toContain("md:top-8");
    expect(popup?.className).not.toContain("-translate-y-1/2");
    expect(popup?.className).toContain("max-w-4xl");
  });

  test("AvailabilityManageModal uses mobile fullscreen layout with desktop top anchor", () => {
    renderWithQuery(
      <AvailabilityManageModal
        open
        onOpenChange={() => {}}
        calendarId="calendar-1"
        timezone="America/New_York"
      />,
    );

    const popup = document.querySelector<HTMLElement>(
      '[data-slot="availability-manage-modal-content"]',
    );
    expect(popup).toBeTruthy();
    expect(popup?.className).toContain("inset-0");
    expect(popup?.className).toContain("md:top-8");
    expect(popup?.className).not.toContain("-translate-y-1/2");
    expect(popup?.className).toContain("max-w-4xl");
  });

  test("AlertDialog is centered in the viewport", () => {
    render(
      <AlertDialog open onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm</AlertDialogTitle>
            <AlertDialogDescription>
              Confirmation description.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>,
    );

    const popup = document.querySelector<HTMLElement>(
      '[data-slot="alert-dialog-content"]',
    );
    expect(popup).toBeTruthy();
    expect(popup?.className).toContain("top-1/2");
    expect(popup?.className).toContain("-translate-y-1/2");
  });
});
