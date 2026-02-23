// Availability editor constants and types

export const WEEKDAYS = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
] as const;

export const RECURRENCE_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
] as const;

export interface TimeBlock {
  startTime: string;
  endTime: string;
}

export interface DaySchedule {
  enabled: boolean;
  blocks: TimeBlock[];
}

export type WeeklySchedule = Record<number, DaySchedule>;

export type AvailabilitySubTabType =
  | "weekly"
  | "overrides"
  | "blocked"
  | "limits";
