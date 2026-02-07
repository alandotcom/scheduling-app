import { DateTime } from "luxon";
import {
  formatDateISO,
  formatDisplayDate as formatDisplayDateLuxon,
  formatDisplayDateTime as formatDisplayDateTimeLuxon,
  formatTimeHHMM,
  getMonthDays as getMonthDaysLuxon,
  getTomorrowInTimezone as getTomorrowInTimezoneLuxon,
  parseISOInTimezone as parseISOInTimezoneLuxon,
  parseInTimezone as parseInTimezoneLuxon,
  toISOString,
} from "@/lib/date-utils";

export function formatDate(date: DateTime): string {
  return formatDateISO(date);
}

export function formatTime(date: DateTime): string {
  return formatTimeHHMM(date);
}

export function formatDisplayDate(dateStr: string, timezone?: string): string {
  return formatDisplayDateLuxon(dateStr, timezone);
}

export function formatDisplayDateTime(
  dateOrString: Date | DateTime | string,
  timezone?: string,
): string {
  return formatDisplayDateTimeLuxon(dateOrString, timezone);
}

export function parseInTimezone(
  dateStr: string,
  timeStr: string,
  timezone: string,
): string {
  return toISOString(parseInTimezoneLuxon(dateStr, timeStr, timezone));
}

export function parseISOInTimezone(
  dateOrString: Date | DateTime | string,
  timezone: string,
): { date: string; time: string } {
  return parseISOInTimezoneLuxon(dateOrString, timezone);
}

export function getTomorrowInTimezone(timezone: string): string {
  return formatDateISO(getTomorrowInTimezoneLuxon(timezone));
}

export function getMonthDays(year: number, month: number): DateTime[] {
  return getMonthDaysLuxon(year, month);
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
