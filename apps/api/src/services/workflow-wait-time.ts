import parseDuration from "parse-duration";

const ISO_OFFSET_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;
const DIGITS_ONLY_PATTERN = /^\d+$/;
const NAIVE_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

type WaitTimeResolution = {
  waitUntil?: Date;
  error?: string;
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

  const firstOffset = getTimeZoneOffsetMs(utcGuess, timeZone);
  const firstPass = new Date(utcGuess.getTime() - firstOffset);

  const secondOffset = getTimeZoneOffsetMs(firstPass, timeZone);
  if (secondOffset !== firstOffset) {
    return new Date(utcGuess.getTime() - secondOffset);
  }

  return firstPass;
}

function createValidDate(value: number | string): Date | null {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
  if (timeZone) {
    const zoned = zonedDateTimeToUtc(value, timeZone);
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
}): WaitTimeResolution {
  const now = input.now ?? new Date();
  const waitTimezone =
    typeof input.waitTimezone === "string" && input.waitTimezone.trim()
      ? input.waitTimezone.trim()
      : undefined;

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

    return {
      waitUntil: new Date(parsed.getTime() + (offsetMs ?? 0)),
    };
  }

  const durationMs = parseDurationMs(input.waitDuration);
  if (durationMs === null) {
    return {
      error:
        "Invalid waitDuration value. Use milliseconds, duration tokens (e.g. 24h), or ISO duration.",
    };
  }

  return {
    waitUntil: new Date(now.getTime() + durationMs),
  };
}
