// Types for availability engine

export interface AvailabilityQuery {
  appointmentTypeId: string;
  calendarIds: string[];
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  timezone: string; // IANA timezone
}

export interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
  remainingCapacity: number;
}

export interface AvailabilityRule {
  id: string;
  calendarId: string;
  weekday: number; // 0-6, Sunday = 0
  startTime: string; // HH:MM
  endTime: string;
  intervalMin: number | null;
  groupId: string | null;
}

export interface AvailabilityOverride {
  id: string;
  calendarId: string;
  date: string; // YYYY-MM-DD
  timeRanges: Array<{ startTime: string; endTime: string }>;
  intervalMin: number | null;
  groupId: string | null;
}

export interface BlockedTimeEntry {
  id: string;
  calendarId: string;
  startAt: Date;
  endAt: Date;
  recurringRule: string | null; // RRULE
}

export interface SchedulingLimitsEntry {
  id: string;
  calendarId: string | null;
  groupId: string | null;
  minNoticeHours: number | null;
  maxNoticeDays: number | null;
  maxPerSlot: number | null;
  maxPerDay: number | null;
  maxPerWeek: number | null;
}

export interface AppointmentTypeData {
  id: string;
  name: string;
  durationMin: number;
  paddingBeforeMin: number | null;
  paddingAfterMin: number | null;
  capacity: number | null;
}

export interface ExistingAppointment {
  id: string;
  calendarId: string;
  appointmentTypeId: string;
  startAt: Date;
  endAt: Date;
  status: string;
}

export interface ResourceConstraint {
  resourceId: string;
  quantityRequired: number;
}

export interface ResourceData {
  id: string;
  name: string;
  quantity: number;
}

export interface AppointmentResource {
  appointmentId: string;
  resourceId: string;
  quantity: number;
}

export interface MergedSchedulingLimits {
  minNoticeHours: number | null;
  maxNoticeDays: number | null;
  maxPerSlot: number | null;
  maxPerDay: number | null;
  maxPerWeek: number | null;
}
