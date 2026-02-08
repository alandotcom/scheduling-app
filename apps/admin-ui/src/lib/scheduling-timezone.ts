import { getUserTimezone } from "@/lib/date-utils";

export type SchedulingTimezoneMode = "calendar" | "viewer";

export const DEFAULT_SCHEDULING_TIMEZONE_MODE: SchedulingTimezoneMode =
  "calendar";

export function isSchedulingTimezoneMode(
  value: string,
): value is SchedulingTimezoneMode {
  return value === "calendar" || value === "viewer";
}

interface ResolveEffectiveSchedulingTimezoneInput {
  mode: SchedulingTimezoneMode;
  calendarTimezone?: string;
  selectedTimezone?: string;
  fallbackTimezone?: string;
  viewerTimezone?: string;
}

export function resolveEffectiveSchedulingTimezone(
  input: ResolveEffectiveSchedulingTimezoneInput,
): string {
  const viewerTimezone = input.viewerTimezone ?? getUserTimezone();
  if (input.mode === "viewer") {
    return viewerTimezone;
  }

  return (
    input.calendarTimezone ??
    input.selectedTimezone ??
    input.fallbackTimezone ??
    viewerTimezone
  );
}
