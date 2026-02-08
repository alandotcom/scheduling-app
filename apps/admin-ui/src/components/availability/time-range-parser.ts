// Free-text time range parser
// Supports formats like "9am-5pm", "9:00am - 5:00pm", "09:00-17:00", "9-5pm", "9a-5p"
// Multiple ranges separated by commas: "9am-12pm, 1pm-5pm"

import type { TimeBlock } from "./constants";

/**
 * Parse a single time string into HH:MM (24h) format.
 * Supports: "9am", "9:30am", "09:00", "17:00", "9a", "5p", "9", "13", "noon", "midnight"
 */
function parseTimeString(raw: string): string | null {
  const s = raw.trim().toLowerCase();

  // Special tokens
  if (s === "noon" || s === "12noon") return "12:00";
  if (s === "midnight" || s === "12midnight") return "00:00";

  // Pattern: optional hours, optional :minutes, optional am/pm marker
  const match = s.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p|a\.m\.|p\.m\.)?$/,
  );
  if (!match) return null;

  const hourToken = match[1];
  if (!hourToken) return null;

  let hours = parseInt(hourToken, 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.replace(/\./g, "");

  if (minutes < 0 || minutes > 59) return null;

  if (meridiem === "am" || meridiem === "a") {
    // 12am = 0, 1am-11am = as-is
    if (hours === 12) hours = 0;
    if (hours < 0 || hours > 12) return null;
  } else if (meridiem === "pm" || meridiem === "p") {
    // 12pm = 12, 1pm-11pm = +12
    if (hours === 12) {
      /* stay 12 */
    } else {
      hours += 12;
    }
    if (hours > 23) return null;
  } else {
    // No meridiem: treat as 24h time
    if (hours < 0 || hours > 23) return null;
  }

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/**
 * Parse a single time range string like "9am-5pm" or "09:00 - 17:00".
 */
function parseTimeRange(raw: string): TimeBlock | null {
  // Split on dash/en-dash/em-dash, but not within "a.m." or "p.m."
  const parts = raw.split(/\s*[-\u2013\u2014]\s*/);
  if (parts.length !== 2) return null;

  const [rawStart, rawEnd] = parts;
  if (!rawStart || !rawEnd) return null;

  const startTime = parseTimeString(rawStart);
  const endTime = parseTimeString(rawEnd);

  if (!startTime || !endTime) return null;

  return { startTime, endTime };
}

/**
 * Parse free-text time ranges input.
 * Supports comma-separated ranges: "9am-12pm, 1pm-5pm"
 * Returns an array of TimeBlock objects, or an empty array if nothing valid was parsed.
 */
export function parseTimeRanges(input: string): TimeBlock[] {
  if (!input.trim()) return [];

  const segments = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const blocks: TimeBlock[] = [];

  for (const segment of segments) {
    const block = parseTimeRange(segment);
    if (block) {
      blocks.push(block);
    }
  }

  return blocks;
}

/**
 * Format a TimeBlock into a human-readable string like "9:00 AM - 5:00 PM".
 */
export function formatTimeBlock(block: TimeBlock): string {
  return `${formatTime24to12(block.startTime)} - ${formatTime24to12(block.endTime)}`;
}

/**
 * Format time blocks as a comma-separated string for display in the input.
 */
export function formatTimeBlocksForInput(blocks: TimeBlock[]): string {
  if (blocks.length === 0) return "";
  return blocks
    .map(
      (b) => `${formatTime24to12(b.startTime)}-${formatTime24to12(b.endTime)}`,
    )
    .join(", ");
}

/**
 * Convert "HH:MM" 24h format to "h:mm AM/PM" 12h format.
 */
function formatTime24to12(time: string): string {
  const [hStr, mStr] = time.split(":");
  if (!hStr || !mStr) return time;

  let hours = parseInt(hStr, 10);
  const minutes = parseInt(mStr, 10);
  const meridiem = hours >= 12 ? "PM" : "AM";

  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;

  if (minutes === 0) return `${hours}${meridiem}`;
  return `${hours}:${minutes.toString().padStart(2, "0")}${meridiem}`;
}

/**
 * Validate time blocks for logical consistency.
 * Returns an error message if invalid, null if valid.
 */
export function validateTimeBlocks(blocks: TimeBlock[]): string | null {
  for (const block of blocks) {
    if (block.startTime >= block.endTime) {
      return `End time must be after start time (${formatTimeBlock(block)})`;
    }
  }

  // Check for overlaps
  const sorted = [...blocks].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (!previous || !current) continue;

    if (current.startTime < previous.endTime) {
      return `Time ranges overlap: ${formatTimeBlock(previous)} and ${formatTimeBlock(current)}`;
    }
  }

  return null;
}
