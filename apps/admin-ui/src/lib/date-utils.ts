// Timezone-aware date utility functions using Luxon

import { DateTime } from "luxon";

/**
 * Format a DateTime as ISO date string (YYYY-MM-DD)
 */
export function formatDateISO(dt: DateTime): string {
  return dt.toISODate() ?? "";
}

/**
 * Format a DateTime as HH:mm time string
 */
export function formatTimeHHMM(dt: DateTime): string {
  return dt.toFormat("HH:mm");
}

/**
 * Format an ISO date string for display in a specific timezone.
 * Returns format like "Jan 15, 2025"
 */
export function formatDisplayDate(dateStr: string, timezone: string): string {
  const dt = DateTime.fromISO(dateStr, { zone: timezone });
  return dt.toLocaleString({
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a DateTime or ISO string for display with date and time.
 * Returns format like "Jan 15, 2025, 2:30 PM"
 */
export function formatDisplayDateTime(
  dtOrString: DateTime | string,
  timezone: string,
): string {
  const dt =
    typeof dtOrString === "string"
      ? DateTime.fromISO(dtOrString, { zone: timezone })
      : dtOrString.setZone(timezone);
  return dt.toLocaleString({
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Parse a date string (YYYY-MM-DD) and time string (HH:mm) into a DateTime
 * in the specified timezone.
 */
export function parseInTimezone(
  dateStr: string,
  timeStr: string,
  timezone: string,
): DateTime {
  return DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: timezone });
}

/**
 * Convert a DateTime to an ISO string (for API calls)
 */
export function toISOString(dt: DateTime): string {
  return dt.toISO() ?? "";
}

/**
 * Get "tomorrow" in a specific timezone
 */
export function getTomorrowInTimezone(timezone: string): DateTime {
  return DateTime.now().setZone(timezone).plus({ days: 1 }).startOf("day");
}

/**
 * Parse an ISO datetime string in a specific timezone and extract date/time components
 */
export function parseISOInTimezone(
  isoString: string,
  timezone: string,
): { date: string; time: string } {
  const dt = DateTime.fromISO(isoString, { zone: timezone });
  return {
    date: formatDateISO(dt),
    time: formatTimeHHMM(dt),
  };
}
