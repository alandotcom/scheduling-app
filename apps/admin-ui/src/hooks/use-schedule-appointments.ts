// Hook for fetching appointments for schedule view

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/query";

interface ScheduleFilters {
  calendarId?: string;
  appointmentTypeId?: string;
  status?: string;
}

export interface ScheduleAppointment {
  id: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  status: "scheduled" | "confirmed" | "cancelled" | "no_show";
  notes: string | null;
  calendar?: { id: string; name: string; timezone: string } | null;
  appointmentType?: { id: string; name: string; durationMin: number } | null;
  client?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  } | null;
}

interface UseScheduleAppointmentsOptions {
  weekStart: Date;
  filters?: ScheduleFilters;
  enabled?: boolean;
}

export function useScheduleAppointments({
  weekStart,
  filters = {},
  enabled = true,
}: UseScheduleAppointmentsOptions) {
  // Calculate week end (Sunday to Saturday)
  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(weekStart.getDate() + 7);
    return end;
  }, [weekStart]);

  // Build query input
  const input = useMemo(
    () => ({
      limit: 200, // Should be enough for a week
      startAt: weekStart.toISOString(),
      endAt: weekEnd.toISOString(),
      ...(filters.calendarId && { calendarId: filters.calendarId }),
      ...(filters.appointmentTypeId && {
        appointmentTypeId: filters.appointmentTypeId,
      }),
      ...(filters.status && {
        status: filters.status as
          | "scheduled"
          | "confirmed"
          | "cancelled"
          | "no_show",
      }),
    }),
    [
      weekStart,
      weekEnd,
      filters.calendarId,
      filters.appointmentTypeId,
      filters.status,
    ],
  );

  const { data, isLoading, error, refetch } = useQuery({
    ...orpc.appointments.list.queryOptions({ input }),
    enabled,
  });

  const appointments: ScheduleAppointment[] = useMemo(() => {
    if (!data?.items) return [];

    return data.items.map((item) => ({
      id: item.id,
      startAt: new Date(item.startAt),
      endAt: new Date(item.endAt),
      timezone: item.timezone,
      status: item.status,
      notes: item.notes,
      calendar: item.calendar ?? null,
      appointmentType: item.appointmentType ?? null,
      client: item.client ?? null,
    }));
  }, [data?.items]);

  return {
    appointments,
    isLoading,
    error,
    hasMore: data?.hasMore ?? false,
    refetch,
  };
}

// Helper to get the start of the week (Sunday) for a given date
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Helper to format a date as YYYY-MM-DD
export function formatDateParam(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

// Helper to parse a YYYY-MM-DD string to Date
export function parseDateParam(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}
