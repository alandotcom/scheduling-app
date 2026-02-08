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

export type BlockRecurrenceType = "none" | "daily" | "weekly";

const weekdayToRrule = new Map<number, string>([
  [0, "SU"],
  [1, "MO"],
  [2, "TU"],
  [3, "WE"],
  [4, "TH"],
  [5, "FR"],
  [6, "SA"],
]);

const rruleToWeekday = new Map<string, number>([
  ["SU", 0],
  ["MO", 1],
  ["TU", 2],
  ["WE", 3],
  ["TH", 4],
  ["FR", 5],
  ["SA", 6],
]);

const parseRruleParts = (rrule: string): Map<string, string> => {
  const parts = new Map<string, string>();

  for (const segment of rrule.split(";")) {
    const [rawKey, ...rawValueParts] = segment.split("=");
    if (!rawKey || rawValueParts.length === 0) continue;
    const key = rawKey.trim().toUpperCase();
    const value = rawValueParts.join("=").trim();
    if (!key || !value) continue;
    parts.set(key, value);
  }

  return parts;
};

const parseUntilDate = (until: string, timezone: string): string | null => {
  if (/^\d{8}T\d{6}Z$/.test(until)) {
    const dt = DateTime.fromFormat(until, "yyyyLLdd'T'HHmmss'Z'", {
      zone: "utc",
    }).setZone(timezone);
    return dt.isValid ? dt.toISODate() : null;
  }

  if (/^\d{8}$/.test(until)) {
    const dt = DateTime.fromFormat(until, "yyyyLLdd", {
      zone: "utc",
    }).setZone(timezone);
    return dt.isValid ? dt.toISODate() : null;
  }

  return null;
};

const formatUntilUtc = (
  date: string,
  time: string,
  timezone: string,
): string | null => {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: timezone }).toUTC();
  return dt.isValid ? dt.toFormat("yyyyLLdd'T'HHmmss'Z'") : null;
};

const normalizeWeekdays = (weekdays: number[]): number[] =>
  Array.from(new Set(weekdays.filter((d) => d >= 0 && d <= 6))).sort(
    (a, b) => a - b,
  );

export interface ParsedRecurrenceRule {
  type: BlockRecurrenceType | "custom";
  weekdays: number[];
  untilDate: string | null;
}

export function parseRecurrenceRule(
  rrule: string | null,
  timezone: string,
): ParsedRecurrenceRule {
  if (!rrule) {
    return { type: "none", weekdays: [], untilDate: null };
  }

  const parts = parseRruleParts(rrule);
  const freq = parts.get("FREQ");
  const untilDate = parts.has("UNTIL")
    ? parseUntilDate(parts.get("UNTIL")!, timezone)
    : null;
  const byDayPart = parts.get("BYDAY");
  const weekdays = byDayPart
    ? normalizeWeekdays(
        byDayPart
          .split(",")
          .map((token) => rruleToWeekday.get(token.trim().toUpperCase()))
          .filter((value): value is number => value !== undefined),
      )
    : [];

  if (freq === "DAILY") {
    return { type: "daily", weekdays: [], untilDate };
  }

  if (freq === "WEEKLY") {
    return { type: "weekly", weekdays, untilDate };
  }

  return { type: "custom", weekdays, untilDate };
}

export function buildRecurrenceRule(input: {
  type: BlockRecurrenceType;
  startDate: string;
  startTime: string;
  endDate: string;
  timezone: string;
  weekdays?: number[];
}): string | null {
  if (input.type === "none") return null;

  const until = formatUntilUtc(input.endDate, input.startTime, input.timezone);
  if (!until) return null;

  if (input.type === "daily") {
    return `FREQ=DAILY;UNTIL=${until}`;
  }

  const weekdays = normalizeWeekdays(input.weekdays ?? []);
  if (weekdays.length === 0) return null;

  const byDay = weekdays
    .map((weekday) => weekdayToRrule.get(weekday))
    .filter((token): token is string => !!token)
    .join(",");

  if (!byDay) return null;

  return `FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${until}`;
}
