import { z } from "zod";
import {
  uuidSchema,
  timestampSchema,
  timeSchema,
  dateSchema,
  weekdaySchema,
  positiveIntSchema,
  nonNegativeIntSchema,
  timezoneSchema,
} from "./common";

// ============================================================================
// AVAILABILITY RULES (Weekly recurring hours)
// ============================================================================

export const availabilityRuleSchema = z.object({
  id: uuidSchema,
  calendarId: uuidSchema,
  weekday: weekdaySchema,
  startTime: timeSchema,
  endTime: timeSchema,
  intervalMin: positiveIntSchema.nullable(),
  groupId: uuidSchema.nullable(),
});

export const createAvailabilityRuleSchema = z
  .object({
    weekday: weekdaySchema,
    startTime: timeSchema,
    endTime: timeSchema,
    intervalMin: positiveIntSchema.optional(),
    groupId: uuidSchema.optional(),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "startTime must be before endTime",
    path: ["startTime"],
  });

export const updateAvailabilityRuleSchema = z.object({
  weekday: weekdaySchema.optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  intervalMin: positiveIntSchema.nullable().optional(),
  groupId: uuidSchema.nullable().optional(),
});

// Bulk update for a calendar's availability
export const setWeeklyAvailabilitySchema = z.object({
  rules: z.array(createAvailabilityRuleSchema),
});

// ============================================================================
// AVAILABILITY OVERRIDES (Date-specific changes)
// ============================================================================

export const availabilityOverrideSchema = z.object({
  id: uuidSchema,
  calendarId: uuidSchema,
  date: dateSchema,
  startTime: timeSchema.nullable(),
  endTime: timeSchema.nullable(),
  isBlocked: z.boolean(),
  intervalMin: positiveIntSchema.nullable(),
  groupId: uuidSchema.nullable(),
});

export const createAvailabilityOverrideSchema = z
  .object({
    date: dateSchema,
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    isBlocked: z.boolean().optional().default(false),
    intervalMin: positiveIntSchema.optional(),
    groupId: uuidSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.isBlocked) return true;
      if (data.startTime && data.endTime) return data.startTime < data.endTime;
      return true;
    },
    {
      message: "startTime must be before endTime for non-blocked overrides",
      path: ["startTime"],
    },
  );

export const updateAvailabilityOverrideSchema = z.object({
  date: dateSchema.optional(),
  startTime: timeSchema.nullable().optional(),
  endTime: timeSchema.nullable().optional(),
  isBlocked: z.boolean().optional(),
  intervalMin: positiveIntSchema.nullable().optional(),
  groupId: uuidSchema.nullable().optional(),
});

// ============================================================================
// BLOCKED TIME (Single or recurring via RRULE)
// ============================================================================

export const blockedTimeSchema = z.object({
  id: uuidSchema,
  calendarId: uuidSchema,
  startAt: timestampSchema,
  endAt: timestampSchema,
  recurringRule: z.string().nullable(), // RRULE string
});

export const createBlockedTimeSchema = z
  .object({
    startAt: timestampSchema,
    endAt: timestampSchema,
    recurringRule: z.string().optional(), // RRULE string
  })
  .refine((data) => data.startAt < data.endAt, {
    message: "startAt must be before endAt",
    path: ["startAt"],
  });

export const updateBlockedTimeSchema = z.object({
  startAt: timestampSchema.optional(),
  endAt: timestampSchema.optional(),
  recurringRule: z.string().nullable().optional(),
});

// ============================================================================
// SCHEDULING LIMITS
// ============================================================================

export const schedulingLimitsSchema = z.object({
  id: uuidSchema,
  calendarId: uuidSchema.nullable(),
  groupId: uuidSchema.nullable(),
  minNoticeHours: nonNegativeIntSchema.nullable(),
  maxNoticeDays: positiveIntSchema.nullable(),
  maxPerSlot: positiveIntSchema.nullable(),
  maxPerDay: positiveIntSchema.nullable(),
  maxPerWeek: positiveIntSchema.nullable(),
});

export const createSchedulingLimitsSchema = z.object({
  calendarId: uuidSchema.optional(),
  groupId: uuidSchema.optional(),
  minNoticeHours: nonNegativeIntSchema.optional(),
  maxNoticeDays: positiveIntSchema.optional(),
  maxPerSlot: positiveIntSchema.optional(),
  maxPerDay: positiveIntSchema.optional(),
  maxPerWeek: positiveIntSchema.optional(),
});

export const updateSchedulingLimitsSchema = z.object({
  minNoticeHours: nonNegativeIntSchema.nullable().optional(),
  maxNoticeDays: positiveIntSchema.nullable().optional(),
  maxPerSlot: positiveIntSchema.nullable().optional(),
  maxPerDay: positiveIntSchema.nullable().optional(),
  maxPerWeek: positiveIntSchema.nullable().optional(),
});

// ============================================================================
// AVAILABILITY ENGINE QUERIES
// ============================================================================

export const availabilityQuerySchema = z.object({
  appointmentTypeId: uuidSchema,
  calendarIds: z.array(uuidSchema).min(1),
  startDate: dateSchema,
  endDate: dateSchema,
  timezone: timezoneSchema,
});

export const availableDateSchema = z.object({
  date: dateSchema,
  available: z.boolean(),
});

export const timeSlotSchema = z.object({
  start: timestampSchema,
  end: timestampSchema,
  available: z.boolean(),
  remainingCapacity: nonNegativeIntSchema,
});

export const availabilityCheckSchema = z.object({
  appointmentTypeId: uuidSchema,
  calendarId: uuidSchema,
  startTime: timestampSchema,
  timezone: timezoneSchema,
});

export const availabilityCheckResultSchema = z.object({
  available: z.boolean(),
  reason: z.string().optional(),
});

// ============================================================================
// INFERRED TYPES
// ============================================================================

export type AvailabilityRule = z.infer<typeof availabilityRuleSchema>;
export type CreateAvailabilityRuleInput = z.infer<
  typeof createAvailabilityRuleSchema
>;
export type UpdateAvailabilityRuleInput = z.infer<
  typeof updateAvailabilityRuleSchema
>;
export type SetWeeklyAvailabilityInput = z.infer<
  typeof setWeeklyAvailabilitySchema
>;

export type AvailabilityOverride = z.infer<typeof availabilityOverrideSchema>;
export type CreateAvailabilityOverrideInput = z.infer<
  typeof createAvailabilityOverrideSchema
>;
export type UpdateAvailabilityOverrideInput = z.infer<
  typeof updateAvailabilityOverrideSchema
>;

export type BlockedTime = z.infer<typeof blockedTimeSchema>;
export type CreateBlockedTimeInput = z.infer<typeof createBlockedTimeSchema>;
export type UpdateBlockedTimeInput = z.infer<typeof updateBlockedTimeSchema>;

export type SchedulingLimits = z.infer<typeof schedulingLimitsSchema>;
export type CreateSchedulingLimitsInput = z.infer<
  typeof createSchedulingLimitsSchema
>;
export type UpdateSchedulingLimitsInput = z.infer<
  typeof updateSchedulingLimitsSchema
>;

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type AvailableDate = z.infer<typeof availableDateSchema>;
export type TimeSlot = z.infer<typeof timeSlotSchema>;
export type AvailabilityCheck = z.infer<typeof availabilityCheckSchema>;
export type AvailabilityCheckResult = z.infer<
  typeof availabilityCheckResultSchema
>;
