import type { EventInput } from "@fullcalendar/core";
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
  calendarColor: string | null;
  clientName: string;
  appointmentTypeName: string | null;
  locationName: string | null;
  hasNotes: boolean;
  resourceSummary: string | null;
}

const STATUS_BORDER_COLOR: Record<CalendarAppointmentStatus, string> = {
  scheduled: "var(--color-chart-1)",
  confirmed: "var(--color-chart-2)",
  cancelled: "var(--color-muted-foreground)",
  no_show: "var(--color-chart-4)",
};

const OVERLAY_CLASS_BY_TYPE: Record<AvailabilityFeedItem["type"], string> = {
  working_hours: "fc-availability-working",
  override_open: "fc-availability-open",
  override_closed: "fc-availability-closed",
  blocked_time: "fc-availability-blocked",
};

function parseDateInput(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.trim().replace(/^#/, "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return `color-mix(in oklab, var(--color-primary), transparent ${Math.round((1 - alpha) * 100)}%)`;
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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
): EventInput[] {
  return appointments.map((appointment) => {
    const statusBorder = STATUS_BORDER_COLOR[appointment.status];
    const baseColor = appointment.calendarColor ?? "#3b82f6";
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
      backgroundColor: hexToRgba(baseColor, isSelected ? 0.45 : 0.24),
      borderColor: statusBorder,
      textColor: "var(--color-foreground)",
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
        calendarColor: appointment.calendarColor ?? null,
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
