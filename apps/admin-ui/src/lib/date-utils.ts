import { DateTime } from "luxon";

type DateInput = DateTime | Date | string;

function normalizeDateTime(input: DateInput, timezone?: string): DateTime {
  if (DateTime.isDateTime(input)) {
    return timezone ? input.setZone(timezone) : input;
  }
  if (input instanceof Date) {
    const dt = DateTime.fromJSDate(input);
    return timezone ? dt.setZone(timezone) : dt;
  }

  const parsed = timezone
    ? DateTime.fromISO(input, { zone: timezone })
    : DateTime.fromISO(input, { setZone: true });
  return parsed;
}

export function formatDateISO(dt: DateTime): string {
  return dt.toISODate() ?? "";
}

export function formatTimeHHMM(dt: DateTime): string {
  return dt.toFormat("HH:mm");
}

export function formatDisplayDate(
  dateOrString: DateInput,
  timezone?: string,
): string {
  const dt = normalizeDateTime(dateOrString, timezone);
  if (!dt.isValid) return "";
  return dt.toLocaleString({
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDisplayDateTime(
  dtOrString: DateInput,
  timezone?: string,
): string {
  const dt = normalizeDateTime(dtOrString, timezone);
  if (!dt.isValid) return "";
  return dt.toLocaleString({
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateWithWeekday(
  dtOrString: DateInput,
  timezone?: string,
): string {
  const dt = normalizeDateTime(dtOrString, timezone);
  if (!dt.isValid) return "";
  return dt.toLocaleString({
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTimeDisplay(
  dtOrString: DateInput,
  timezone?: string,
): string {
  const dt = normalizeDateTime(dtOrString, timezone);
  if (!dt.isValid) return "";
  return dt.toLocaleString(DateTime.TIME_SIMPLE);
}

export function getWeekStart(date: DateInput): DateTime {
  const dt = normalizeDateTime(date).startOf("day");
  const daysFromSunday = dt.weekday % 7;
  return dt.minus({ days: daysFromSunday }).startOf("day");
}

export function getWeekDays(weekStart: DateTime): DateTime[] {
  const start = weekStart.startOf("day");
  return Array.from({ length: 7 }, (_, i) => start.plus({ days: i }));
}

export function formatWeekRange(weekStart: DateTime): string {
  const start = weekStart.startOf("day");
  const end = start.plus({ days: 6 });

  if (start.year !== end.year) {
    return `${start.toFormat("MMM d, yyyy")} - ${end.toFormat("MMM d, yyyy")}`;
  }
  if (start.month === end.month) {
    return `${start.toFormat("MMM d")} - ${end.toFormat("d")}, ${start.year}`;
  }
  return `${start.toFormat("MMM d")} - ${end.toFormat("MMM d")}, ${start.year}`;
}

export function getMonthDays(year: number, month: number): DateTime[] {
  const monthStart = DateTime.local(year, month + 1, 1).startOf("day");
  const startPadding = monthStart.weekday % 7;
  const gridStart = monthStart.minus({ days: startPadding });
  return Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }));
}

export function isSameDay(dt1: DateTime, dt2: DateTime): boolean {
  return dt1.hasSame(dt2, "day");
}

export function isToday(dt: DateTime): boolean {
  return dt.hasSame(DateTime.now(), "day");
}

export function isPast(dt: DateTime): boolean {
  return dt < DateTime.now();
}

export function parseDateParam(str: string): DateTime {
  return DateTime.fromISO(str).startOf("day");
}

export function parseDateParamInTimezone(
  str: string,
  timezone: string,
): DateTime {
  return DateTime.fromISO(str, { zone: timezone }).startOf("day");
}

export function parseISO(value: DateInput, timezone?: string): DateTime {
  return normalizeDateTime(value, timezone);
}

export function parseInTimezone(
  dateStr: string,
  timeStr: string,
  timezone: string,
): DateTime {
  return DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: timezone });
}

export function toISOString(dt: DateTime): string {
  return dt.toISO() ?? "";
}

export function getTomorrowInTimezone(timezone: string): DateTime {
  return DateTime.now().setZone(timezone).plus({ days: 1 }).startOf("day");
}

export function parseISOInTimezone(
  isoString: DateInput,
  timezone: string,
): { date: string; time: string } {
  const dt = normalizeDateTime(isoString).setZone(timezone);
  return {
    date: formatDateISO(dt),
    time: formatTimeHHMM(dt),
  };
}

export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatTimezoneShort(
  timezone: string,
  reference?: DateInput,
): string {
  const dt = reference
    ? normalizeDateTime(reference).setZone(timezone)
    : DateTime.now().setZone(timezone);

  if (!dt.isValid) {
    return timezone;
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    }).formatToParts(dt.toJSDate());
    const zonePart = parts.find((part) => part.type === "timeZoneName")?.value;
    if (zonePart) {
      return zonePart;
    }
  } catch {
    // Fall back to Luxon offset label if Intl cannot format this zone.
  }

  return dt.offsetNameShort || timezone;
}

export function formatTimezonePath(timezone: string): string {
  return timezone
    .split("/")
    .map((part) => part.replaceAll("_", " "))
    .join("/");
}

export function formatTimezonePickerLabel(
  timezone: string,
  reference?: DateInput,
): string {
  const path = formatTimezonePath(timezone);
  const short = formatTimezoneShort(timezone, reference);
  if (!short || short === timezone) {
    return path;
  }
  return `${path} (${short})`;
}

export function toJSDate(dt: DateTime): Date {
  return dt.toJSDate();
}

export function fromJSDate(date: Date): DateTime {
  return DateTime.fromJSDate(date);
}

export function formatRelativeTime(dateOrString: DateInput): string {
  const dt = normalizeDateTime(dateOrString);
  if (!dt.isValid) return "";

  const now = DateTime.now();
  const diffInSeconds = Math.abs(now.diff(dt, "seconds").seconds);

  if (diffInSeconds < 60) {
    return "Just now";
  }

  const relative = dt.toRelative({ base: now });
  if (relative && diffInSeconds < 7 * 24 * 60 * 60) {
    return relative;
  }

  return dt.toLocaleString({
    month: "short",
    day: "numeric",
    year: dt.year !== now.year ? "numeric" : undefined,
  });
}
