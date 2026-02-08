// Hook for fetching appointments for schedule view

import { useMemo } from "react";
import { DateTime } from "luxon";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/query";
import {
  formatDateISO,
  getWeekStart as getWeekStartLuxon,
  parseDateParam as parseDateParamLuxon,
  parseISO,
} from "@/lib/date-utils";

interface ScheduleFilters {
  calendarId?: string;
  appointmentTypeId?: string;
  clientId?: string;
  status?: string;
}

export interface ScheduleAppointment {
  id: string;
  startAt: DateTime;
  endAt: DateTime;
  calendarId: string;
  calendarColor?: string | null;
  status: "scheduled" | "confirmed" | "cancelled" | "no_show";
  clientName: string | null;
  appointmentTypeName: string | null;
  locationName: string | null;
  hasNotes: boolean;
  resourceSummary: string | null;
}

interface UseScheduleAppointmentsOptions {
  weekStart: DateTime;
  displayTimezone: string;
  filters?: ScheduleFilters;
  enabled?: boolean;
}

export function useScheduleAppointments({
  weekStart,
  displayTimezone,
  filters = {},
  enabled = true,
}: UseScheduleAppointmentsOptions) {
  // Calculate week end (Sunday to Saturday)
  const weekEnd = useMemo(() => weekStart.plus({ days: 7 }), [weekStart]);

  // Build query input
  const input = useMemo(
    () => ({
      limit: 200, // Should be enough for a week
      startAt: weekStart.toISO() ?? "",
      endAt: weekEnd.toISO() ?? "",
      ...(filters.calendarId && { calendarId: filters.calendarId }),
      ...(filters.appointmentTypeId && {
        appointmentTypeId: filters.appointmentTypeId,
      }),
      ...(filters.clientId && { clientId: filters.clientId }),
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
      filters.clientId,
      filters.status,
    ],
  );

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    ...orpc.appointments.range.queryOptions({ input }),
    enabled,
  });

  const appointments: ScheduleAppointment[] = useMemo(() => {
    if (!data?.items) return [];

    return data.items.map((item) => ({
      id: item.id,
      startAt: parseISO(item.startAt, displayTimezone),
      endAt: parseISO(item.endAt, displayTimezone),
      calendarId: item.calendarId,
      calendarColor: item.calendarColor,
      status: item.status,
      clientName: item.clientName,
      appointmentTypeName: item.appointmentTypeName,
      locationName: item.locationName,
      hasNotes: item.hasNotes,
      resourceSummary: item.resourceSummary,
    }));
  }, [data?.items, displayTimezone]);

  return {
    appointments,
    isLoading,
    isFetching,
    error,
    hasMore: data?.hasMore ?? false,
    refetch,
  };
}

// Helper to get the start of the week (Sunday) for a given date
export const getWeekStart = getWeekStartLuxon;

// Helper to format a date as YYYY-MM-DD
export function formatDateParam(date: DateTime): string {
  return formatDateISO(date);
}

// Helper to parse a YYYY-MM-DD string to Date
export const parseDateParam = parseDateParamLuxon;
