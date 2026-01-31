// Availability editor utility functions

import { DateTime } from "luxon";

/**
 * Format a Date object as YYYY-MM-DD string.
 * Note: Uses browser local timezone. For timezone-aware formatting,
 * use formatDateInTimezone instead.
 */
export function formatDate(date: Date): string {
  const dt = DateTime.fromJSDate(date);
  return dt.toISODate() ?? "";
}

/**
 * Format a Date object as HH:mm time string.
 * Note: Uses browser local timezone. For timezone-aware formatting,
 * use formatTimeInTimezone instead.
 */
export function formatTime(date: Date): string {
  const dt = DateTime.fromJSDate(date);
  return dt.toFormat("HH:mm");
}

/**
 * Format an ISO date string for display.
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param timezone - Optional IANA timezone (defaults to browser local)
 */
export function formatDisplayDate(dateStr: string, timezone?: string): string {
  const dt = timezone
    ? DateTime.fromISO(dateStr, { zone: timezone })
    : DateTime.fromISO(dateStr);
  return dt.toLocaleString({
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a Date or ISO string for display with date and time.
 * @param dateOrString - Date object or ISO string
 * @param timezone - Optional IANA timezone (defaults to browser local)
 */
export function formatDisplayDateTime(
  dateOrString: Date | string,
  timezone?: string,
): string {
  const dt =
    dateOrString instanceof Date
      ? DateTime.fromJSDate(dateOrString)
      : timezone
        ? DateTime.fromISO(dateOrString, { zone: timezone })
        : DateTime.fromISO(dateOrString);

  const zonedDt = timezone ? dt.setZone(timezone) : dt;
  return zonedDt.toLocaleString({
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Parse a date and time string in a specific timezone and return ISO string.
 * This is the key function for fixing timezone bugs in availability editors.
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param timeStr - Time string in HH:mm format
 * @param timezone - IANA timezone string (e.g., "America/New_York")
 */
export function parseInTimezone(
  dateStr: string,
  timeStr: string,
  timezone: string,
): string {
  const dt = DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: timezone });
  return dt.toISO() ?? "";
}

/**
 * Parse a datetime (Date object or ISO string) in a specific timezone and extract date/time parts.
 * @param dateOrString - Date object or ISO datetime string
 * @param timezone - IANA timezone to interpret the time in
 */
export function parseISOInTimezone(
  dateOrString: Date | string,
  timezone: string,
): { date: string; time: string } {
  const dt =
    dateOrString instanceof Date
      ? DateTime.fromJSDate(dateOrString).setZone(timezone)
      : DateTime.fromISO(dateOrString, { zone: timezone });
  return {
    date: dt.toISODate() ?? "",
    time: dt.toFormat("HH:mm"),
  };
}

/**
 * Get "tomorrow" in a specific timezone as a YYYY-MM-DD string.
 */
export function getTomorrowInTimezone(timezone: string): string {
  const dt = DateTime.now().setZone(timezone).plus({ days: 1 }).startOf("day");
  return dt.toISODate() ?? "";
}

export function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Add padding for days before the first of the month
  const startPadding = firstDay.getDay();
  for (let i = startPadding - 1; i >= 0; i--) {
    const date = new Date(year, month, -i);
    days.push(date);
  }

  // Add all days of the month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  // Add padding for days after the last of the month
  const endPadding = 6 - lastDay.getDay();
  for (let i = 1; i <= endPadding; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

export function rruleToLabel(rrule: string | null): string {
  if (!rrule) return "One-time block";
  if (rrule.includes("FREQ=DAILY")) return "Repeats daily";
  if (rrule.includes("BYDAY=MO,TU,WE,TH,FR")) return "Repeats weekdays";
  if (rrule.includes("FREQ=WEEKLY")) return "Repeats weekly";
  return "Custom recurrence";
}

export function recurrenceToRrule(type: string): string | null {
  switch (type) {
    case "daily":
      return "FREQ=DAILY";
    case "weekly":
      return "FREQ=WEEKLY";
    case "weekdays":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    default:
      return null;
  }
}

export function rruleToRecurrence(rrule: string | null): string {
  if (!rrule) return "none";
  if (rrule.includes("BYDAY=MO,TU,WE,TH,FR")) return "weekdays";
  if (rrule.includes("FREQ=DAILY")) return "daily";
  if (rrule.includes("FREQ=WEEKLY")) return "weekly";
  return "none";
}
