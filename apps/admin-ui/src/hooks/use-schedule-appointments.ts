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

type ScheduleStatus = "scheduled" | "confirmed" | "cancelled" | "no_show";
const isScheduleStatus = (value: string): value is ScheduleStatus =>
  value === "scheduled" ||
  value === "confirmed" ||
  value === "cancelled" ||
  value === "no_show";

export interface ScheduleAppointment {
  id: string;
  startAt: DateTime;
  endAt: DateTime;
  calendarId: string;
  calendarColor?: string | null;
  status: "scheduled" | "confirmed" | "cancelled" | "no_show";
  clientName: string;
  appointmentTypeName: string | null;
  locationName: string | null;
  hasNotes: boolean;
  resourceSummary: string | null;
}

interface UseScheduleAppointmentsOptions {
  rangeStart: DateTime;
  rangeEnd: DateTime;
  displayTimezone: string;
  filters?: ScheduleFilters;
  enabled?: boolean;
}

export function useScheduleAppointments({
  rangeStart,
  rangeEnd,
  filters = {},
  enabled = true,
}: UseScheduleAppointmentsOptions) {
  const statusFilter =
    filters.status && isScheduleStatus(filters.status)
      ? filters.status
      : undefined;

  // Build query input
  const input = useMemo(
    () => ({
      limit: 500,
      startAt: rangeStart.toISO() ?? "",
      endAt: rangeEnd.toISO() ?? "",
      ...(filters.calendarId && { calendarId: filters.calendarId }),
      ...(filters.appointmentTypeId && {
        appointmentTypeId: filters.appointmentTypeId,
      }),
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(statusFilter && { status: statusFilter }),
    }),
    [
      rangeStart,
      rangeEnd,
      filters.calendarId,
      filters.appointmentTypeId,
      filters.clientId,
      statusFilter,
    ],
  );

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    ...orpc.appointments.range.queryOptions({ input }),
    enabled,
    placeholderData: (previous) => previous,
  });

  const appointments: ScheduleAppointment[] = useMemo(() => {
    if (!data?.items) return [];

    return data.items.map((item) => ({
      id: item.id,
      // Keep absolute instants from API; FullCalendar applies display timezone.
      startAt: parseISO(item.startAt),
      endAt: parseISO(item.endAt),
      calendarId: item.calendarId,
      calendarColor: item.calendarColor,
      status: item.status,
      clientName: item.clientName,
      appointmentTypeName: item.appointmentTypeName,
      locationName: item.locationName,
      hasNotes: item.hasNotes,
      resourceSummary: item.resourceSummary,
    }));
  }, [data]);

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
