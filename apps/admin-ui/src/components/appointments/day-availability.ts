import { DateTime } from "luxon";

export const LOW_AVAILABILITY_THRESHOLD = 2;

export type DayAvailabilityLevel = "none" | "low" | "good";

export interface AvailabilitySlotLike {
  start: string;
  available: boolean;
}

function slotDateKey(startIso: string, timezone: string): string | null {
  const dt = DateTime.fromISO(startIso, { setZone: true }).setZone(timezone);
  return dt.isValid ? dt.toISODate() : null;
}

export function buildDayAvailabilityMap(
  slots: AvailabilitySlotLike[],
  timezone: string,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const slot of slots) {
    if (!slot.available) continue;
    const dateKey = slotDateKey(slot.start, timezone);
    if (!dateKey) continue;
    counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
  }

  return counts;
}

export function filterAvailableSlotsForDate<T extends AvailabilitySlotLike>(
  slots: T[],
  dateKey: string,
  timezone: string,
): T[] {
  return slots.filter((slot) => {
    if (!slot.available) return false;
    return slotDateKey(slot.start, timezone) === dateKey;
  });
}

export function getDayAvailabilityLevel(
  availableCount: number,
  lowThreshold = LOW_AVAILABILITY_THRESHOLD,
): DayAvailabilityLevel {
  if (availableCount <= 0) return "none";
  if (availableCount <= lowThreshold) return "low";
  return "good";
}
