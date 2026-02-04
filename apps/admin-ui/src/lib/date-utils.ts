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

/**
 * Format a date as relative time (e.g., "2 hours ago", "3 days ago")
 */
export function formatRelativeTime(dateString: string | Date): string {
  const date =
    typeof dateString === "string" ? new Date(dateString) : dateString;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60)
    return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/**
 * Format a time for display (e.g., "2:30 PM")
 */
export function formatTimeDisplay(dateOrString: Date | string): string {
  const date =
    typeof dateOrString === "string" ? new Date(dateOrString) : dateOrString;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
