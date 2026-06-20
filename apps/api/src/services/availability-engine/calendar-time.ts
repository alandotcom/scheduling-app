// Pure calendar/time primitives shared by the availability engine's slot
// generation and the schedule-shading feed. Keeping the weekday convention and
// HH:MM parsing in one place stops the two callers from drifting.

import { DateTime } from "luxon";

// Luxon weekday is 1=Mon..7=Sun; the schema stores 0=Sun..6=Sat.
export function sundayZeroWeekday(dt: DateTime): number {
  return dt.weekday % 7;
}

export function parseHm(time: string): { hour: number; minute: number } {
  const [hour, minute] = time.split(":").map(Number);
  return { hour: hour ?? 0, minute: minute ?? 0 };
}

export function setZonedTime(
  day: DateTime,
  time: { hour: number; minute: number },
): DateTime {
  return day.set({
    hour: time.hour,
    minute: time.minute,
    second: 0,
    millisecond: 0,
  });
}
