import { z } from "zod";
import {
  uuidSchema,
  timestampsSchema,
  timezoneSchema,
  nonNegativeIntSchema,
} from "./common";

// Base calendar schema
export const calendarSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  locationId: uuidSchema.nullable(),
  name: z.string().min(1).max(255),
  timezone: timezoneSchema,
  ...timestampsSchema.shape,
});

// Create calendar input
export const createCalendarSchema = z.object({
  locationId: uuidSchema.optional(),
  name: z.string().min(1).max(255),
  timezone: timezoneSchema,
});

// Update calendar input
export const updateCalendarSchema = z.object({
  locationId: uuidSchema.nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  timezone: timezoneSchema.optional(),
});

// List calendars query
export const listCalendarsQuerySchema = z.object({
  locationId: uuidSchema.optional(),
  cursor: uuidSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

// Response types
export const calendarResponseSchema = calendarSchema;
export const calendarListItemSchema = calendarSchema.extend({
  relationshipCounts: z.object({
    appointmentsThisWeek: nonNegativeIntSchema,
  }),
});

// Inferred types
export type Calendar = z.infer<typeof calendarSchema>;
export type CreateCalendarInput = z.infer<typeof createCalendarSchema>;
export type UpdateCalendarInput = z.infer<typeof updateCalendarSchema>;
export type ListCalendarsQuery = z.infer<typeof listCalendarsQuerySchema>;
export type CalendarResponse = z.infer<typeof calendarResponseSchema>;
export type CalendarListItem = z.infer<typeof calendarListItemSchema>;
