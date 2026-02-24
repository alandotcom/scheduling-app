import type { EventInput } from "@fullcalendar/react";
import type { AvailabilityFeedItem } from "@scheduling/dto";

import type { ScheduleAppointment } from "@/hooks/use-schedule-appointments";

export type CalendarAppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "cancelled"
  | "no_show";

export interface CalendarAppointmentEventMeta {
  kind: "appointment";
  appointmentId: string;
  status: CalendarAppointmentStatus;
  calendarId: string;
  calendarColor: string;
  clientName: string;
  appointmentTypeName: string | null;
  locationName: string | null;
  hasNotes: boolean;
  resourceSummary: string | null;
}

const OVERLAY_CLASS_BY_TYPE: Record<AvailabilityFeedItem["type"], string> = {
  working_hours: "fc-availability-working",
  override_open: "fc-availability-open",
  override_closed: "fc-availability-closed",
  blocked_time: "fc-availability-blocked",
};

function parseDateInput(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function isCalendarAppointmentEventMeta(
  value: unknown,
): value is CalendarAppointmentEventMeta {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<CalendarAppointmentEventMeta>;
  return (
    record.kind === "appointment" &&
    typeof record.appointmentId === "string" &&
    typeof record.calendarId === "string" &&
    typeof record.status === "string"
  );
}

export function toAppointmentEvents(
  appointments: ScheduleAppointment[],
  selectedId: string | null,
  calendarColorById?: Map<string, string>,
): EventInput[] {
  return appointments.map((appointment) => {
    const baseColor =
      calendarColorById?.get(appointment.calendarId) ??
      appointment.calendarColor ??
      "#3b82f6";
    const isSelected = appointment.id === selectedId;

    return {
      id: appointment.id,
      title: appointment.clientName,
      start: appointment.startAt.toJSDate(),
      end: appointment.endAt.toJSDate(),
      allDay: false,
      editable:
        appointment.status === "scheduled" ||
        appointment.status === "confirmed",
      color: baseColor,
      contrastColor: "var(--color-foreground)",
      classNames: [
        "fc-appointment-event",
        `fc-appointment-status-${appointment.status}`,
        isSelected ? "fc-appointment-selected" : "",
      ].filter(Boolean),
      extendedProps: {
        kind: "appointment",
        appointmentId: appointment.id,
        status: appointment.status,
        calendarId: appointment.calendarId,
        calendarColor: baseColor,
        clientName: appointment.clientName,
        appointmentTypeName: appointment.appointmentTypeName,
        locationName: appointment.locationName,
        hasNotes: appointment.hasNotes,
        resourceSummary: appointment.resourceSummary,
      } satisfies CalendarAppointmentEventMeta,
    } satisfies EventInput;
  });
}

export function toAvailabilityBackgroundEvents(
  items: AvailabilityFeedItem[],
): EventInput[] {
  return items.map((item) => ({
    id: `${item.type}:${item.sourceId ?? "none"}:${item.startAt.toString()}`,
    start: parseDateInput(item.startAt),
    end: parseDateInput(item.endAt),
    allDay: false,
    display: "background",
    classNames: ["fc-availability-event", OVERLAY_CLASS_BY_TYPE[item.type]],
    extendedProps: {
      kind: "availability",
      feedType: item.type,
      calendarId: item.calendarId,
      label: item.label,
      reason: item.reason,
      sourceId: item.sourceId,
    },
  }));
}
