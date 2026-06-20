import {
  isValidIanaTimeZone,
  normalizeWaitAllowedHoursMode,
  parseTimeOfDayMinutes,
  type WaitAllowedHoursMode,
} from "@scheduling/dto";
import parseDuration from "parse-duration";

const ISO_OFFSET_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;
const DIGITS_ONLY_PATTERN = /^\d+$/;
const NAIVE_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

type WaitTimeResolution = {
  waitUntil?: Date;
  error?: string;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseNaiveDateTime(value: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null {
  const match = NAIVE_DATETIME_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;

  if (!(year && month && day)) {
    return null;
  }

  return {
    year: Number.parseInt(year, 10),
    month: Number.parseInt(month, 10),
    day: Number.parseInt(day, 10),
    hour: Number.parseInt(hour, 10),
    minute: Number.parseInt(minute, 10),
    second: Number.parseInt(second, 10),
  };
}

function getDateTimePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((part) => part.type === type)?.value ?? "0";
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const asUtcTimestamp = Date.UTC(
    Number.parseInt(getDateTimePart(parts, "year"), 10),
    Number.parseInt(getDateTimePart(parts, "month"), 10) - 1,
    Number.parseInt(getDateTimePart(parts, "day"), 10),
    Number.parseInt(getDateTimePart(parts, "hour"), 10),
    Number.parseInt(getDateTimePart(parts, "minute"), 10),
    Number.parseInt(getDateTimePart(parts, "second"), 10),
  );

  return asUtcTimestamp - date.getTime();
}

function getDatePartsInTimeZone(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  return {
    year: Number.parseInt(getDateTimePart(parts, "year"), 10),
    month: Number.parseInt(getDateTimePart(parts, "month"), 10),
    day: Number.parseInt(getDateTimePart(parts, "day"), 10),
    hour: Number.parseInt(getDateTimePart(parts, "hour"), 10),
    minute: Number.parseInt(getDateTimePart(parts, "minute"), 10),
    second: Number.parseInt(getDateTimePart(parts, "second"), 10),
  };
}

function zonedDateTimeToUtc(value: string, timeZone: string): Date | null {
  const parsed = parseNaiveDateTime(value);
  if (!parsed) {
    return null;
  }

  const utcGuess = new Date(
    Date.UTC(
      parsed.year,
      parsed.month - 1,
      parsed.day,
      parsed.hour,
      parsed.minute,
      parsed.second,
    ),
  );

  try {
    const firstOffset = getTimeZoneOffsetMs(utcGuess, timeZone);
    const firstPass = new Date(utcGuess.getTime() - firstOffset);

    const secondOffset = getTimeZoneOffsetMs(firstPass, timeZone);
    if (secondOffset !== firstOffset) {
      return new Date(utcGuess.getTime() - secondOffset);
    }

    return firstPass;
  } catch {
    return null;
  }
}

function createValidDate(value: number | string): Date | null {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDaysToDateParts(
  input: Pick<DateParts, "year" | "month" | "day">,
  days: number,
): Pick<DateParts, "year" | "month" | "day"> {
  const base = new Date(Date.UTC(input.year, input.month - 1, input.day));
  base.setUTCDate(base.getUTCDate() + days);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  };
}

function formatTwoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function toNaiveDateTimeValue(input: {
  date: Pick<DateParts, "year" | "month" | "day">;
  minutes: number;
}): string {
  const hour = Math.floor(input.minutes / 60);
  const minute = input.minutes % 60;
  return `${input.date.year}-${formatTwoDigits(input.date.month)}-${formatTwoDigits(input.date.day)}T${formatTwoDigits(hour)}:${formatTwoDigits(minute)}:00`;
}

function applyDailyWindowLocal(input: {
  candidate: Date;
  startMinutes: number;
  endMinutes: number;
}): Date {
  const candidateSeconds =
    input.candidate.getHours() * 3600 +
    input.candidate.getMinutes() * 60 +
    input.candidate.getSeconds();
  const startSeconds = input.startMinutes * 60;
  const endSeconds = input.endMinutes * 60;

  if (candidateSeconds < startSeconds) {
    const adjusted = new Date(input.candidate.getTime());
    adjusted.setHours(
      Math.floor(input.startMinutes / 60),
      input.startMinutes % 60,
      0,
      0,
    );
    return adjusted;
  }

  if (candidateSeconds >= endSeconds) {
    const adjusted = new Date(input.candidate.getTime());
    adjusted.setDate(adjusted.getDate() + 1);
    adjusted.setHours(
      Math.floor(input.startMinutes / 60),
      input.startMinutes % 60,
      0,
      0,
    );
    return adjusted;
  }

  return input.candidate;
}

function applyDailyWindowZoned(input: {
  candidate: Date;
  startMinutes: number;
  endMinutes: number;
  timeZone: string;
}): Date | null {
  let zoned: DateParts;
  try {
    zoned = getDatePartsInTimeZone(input.candidate, input.timeZone);
  } catch {
    return null;
  }

  const candidateSeconds = zoned.hour * 3600 + zoned.minute * 60 + zoned.second;
  const startSeconds = input.startMinutes * 60;
  const endSeconds = input.endMinutes * 60;

  if (candidateSeconds < startSeconds) {
    return zonedDateTimeToUtc(
      toNaiveDateTimeValue({
        date: zoned,
        minutes: input.startMinutes,
      }),
      input.timeZone,
    );
  }

  if (candidateSeconds >= endSeconds) {
    const nextDate = addDaysToDateParts(zoned, 1);
    return zonedDateTimeToUtc(
      toNaiveDateTimeValue({
        date: nextDate,
        minutes: input.startMinutes,
      }),
      input.timeZone,
    );
  }

  return input.candidate;
}

function applyWaitAllowedHours(input: {
  candidate: Date;
  waitAllowedHoursMode: WaitAllowedHoursMode;
  waitAllowedStartTime?: unknown;
  waitAllowedEndTime?: unknown;
  timeZone?: string | undefined;
}): WaitTimeResolution {
  if (input.waitAllowedHoursMode === "off") {
    return {
      waitUntil: input.candidate,
    };
  }

  const startMinutes = parseTimeOfDayMinutes(input.waitAllowedStartTime);
  if (startMinutes === null) {
    return {
      error: "Invalid waitAllowedStartTime value. Use HH:MM (24-hour).",
    };
  }

  const endMinutes = parseTimeOfDayMinutes(input.waitAllowedEndTime);
  if (endMinutes === null) {
    return {
      error: "Invalid waitAllowedEndTime value. Use HH:MM (24-hour).",
    };
  }

  if (startMinutes >= endMinutes) {
    return {
      error:
        "Invalid allowed-hours window. waitAllowedStartTime must be earlier than waitAllowedEndTime.",
    };
  }

  const adjusted = input.timeZone
    ? applyDailyWindowZoned({
        candidate: input.candidate,
        startMinutes,
        endMinutes,
        timeZone: input.timeZone,
      })
    : applyDailyWindowLocal({
        candidate: input.candidate,
        startMinutes,
        endMinutes,
      });

  if (!adjusted) {
    return {
      error:
        "Unable to resolve allowed-hours window in the configured timezone.",
    };
  }

  return {
    waitUntil: adjusted,
  };
}

function parseEpochTimestamp(value: string): Date | null {
  if (!DIGITS_ONLY_PATTERN.test(value)) {
    return null;
  }

  const epoch = Number.parseInt(value, 10);
  const millis = value.length <= 10 ? epoch * 1000 : epoch;
  return createValidDate(millis);
}

function parseIsoOffsetTimestamp(value: string): Date | null {
  if (!ISO_OFFSET_PATTERN.test(value)) {
    return null;
  }

  return createValidDate(value);
}

function parseZonedOrNativeTimestamp(
  value: string,
  timeZone?: string,
): Date | null {
  const normalizedTimeZone =
    typeof timeZone === "string" && isValidIanaTimeZone(timeZone)
      ? timeZone.trim()
      : undefined;
  if (normalizedTimeZone) {
    const zoned = zonedDateTimeToUtc(value, normalizedTimeZone);
    if (zoned) {
      return zoned;
    }
  }

  return createValidDate(value);
}

export function parseDurationMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = parseDuration(trimmed, "ms");
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

export function parseTimestampWithTimezone(
  value: unknown,
  timeZone?: string,
): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    return createValidDate(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return (
    parseEpochTimestamp(trimmed) ??
    parseIsoOffsetTimestamp(trimmed) ??
    parseZonedOrNativeTimestamp(trimmed, timeZone)
  );
}

export function resolveWaitUntil(input: {
  now?: Date;
  waitUntil?: unknown;
  waitDuration?: unknown;
  waitOffset?: unknown;
  waitTimezone?: string;
  orgTimezone?: string;
  waitAllowedHoursMode?: unknown;
  waitAllowedStartTime?: unknown;
  waitAllowedEndTime?: unknown;
}): WaitTimeResolution {
  const now = input.now ?? new Date();
  const waitTimezone =
    typeof input.waitTimezone === "string" && input.waitTimezone.trim()
      ? input.waitTimezone.trim()
      : undefined;
  if (waitTimezone && !isValidIanaTimeZone(waitTimezone)) {
    return {
      error:
        "Invalid waitTimezone value. Use a valid IANA timezone like America/New_York.",
    };
  }

  const orgTimezoneRaw =
    typeof input.orgTimezone === "string" && input.orgTimezone.trim()
      ? input.orgTimezone.trim()
      : undefined;
  const orgTimezone =
    orgTimezoneRaw && isValidIanaTimeZone(orgTimezoneRaw)
      ? orgTimezoneRaw
      : undefined;
  const waitAllowedHoursMode = normalizeWaitAllowedHoursMode(
    input.waitAllowedHoursMode,
  );
  const allowedHoursTimeZone = waitTimezone ?? orgTimezone;

  if (input.waitUntil !== undefined && input.waitUntil !== "") {
    const parsed = parseTimestampWithTimezone(input.waitUntil, waitTimezone);
    if (!parsed) {
      return {
        error: "Invalid waitUntil value. Use an ISO timestamp or unix epoch.",
      };
    }

    const offsetMs = parseDurationMs(input.waitOffset);
    if (
      input.waitOffset !== undefined &&
      input.waitOffset !== "" &&
      offsetMs === null
    ) {
      return {
        error:
          "Invalid waitOffset value. Use duration like -1d, 6h, 30m, or ISO duration.",
      };
    }

    return applyWaitAllowedHours({
      candidate: new Date(parsed.getTime() + (offsetMs ?? 0)),
      waitAllowedHoursMode,
      waitAllowedStartTime: input.waitAllowedStartTime,
      waitAllowedEndTime: input.waitAllowedEndTime,
      timeZone: allowedHoursTimeZone,
    });
  }

  const durationMs = parseDurationMs(input.waitDuration);
  if (durationMs === null) {
    return {
      error:
        "Invalid waitDuration value. Use milliseconds, duration tokens (e.g. 24h), or ISO duration.",
    };
  }

  return applyWaitAllowedHours({
    candidate: new Date(now.getTime() + durationMs),
    waitAllowedHoursMode,
    waitAllowedStartTime: input.waitAllowedStartTime,
    waitAllowedEndTime: input.waitAllowedEndTime,
    timeZone: allowedHoursTimeZone,
  });
}
