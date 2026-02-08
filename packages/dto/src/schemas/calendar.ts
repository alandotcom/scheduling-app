import { z } from "zod";
import {
  uuidSchema,
  timestampsSchema,
  timezoneSchema,
  nonNegativeIntSchema,
  paginatedResponseSchema,
} from "./common";

// Base calendar schema
export const calendarSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  locationId: uuidSchema.nullable(),
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  timezone: timezoneSchema,
  ...timestampsSchema.shape,
});

// Create calendar input
export const createCalendarSchema = z.object({
  locationId: uuidSchema.optional(),
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  timezone: timezoneSchema,
});

// Update calendar input
export const updateCalendarSchema = z.object({
  locationId: uuidSchema.nullable().optional(),
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name is too long")
    .optional(),
  timezone: timezoneSchema.optional(),
});

// List calendars query
export const listCalendarsQuerySchema = z.object({
  locationId: uuidSchema.optional(),
  cursor: uuidSchema.optional(),
  limit: z
    .number()
    .int()
    .min(1, "Must be at least 1")
    .max(100, "Must be at most 100")
    .default(20),
});

// Response types
export const calendarResponseSchema = calendarSchema;
export const calendarWithLocationSchema = calendarSchema.extend({
  location: z
    .object({
      id: uuidSchema,
      name: z.string(),
      timezone: timezoneSchema,
    })
    .optional(),
});
export const calendarListItemSchema = calendarSchema.extend({
  relationshipCounts: z.object({
    appointmentsThisWeek: nonNegativeIntSchema,
  }),
});
export const calendarListResponseSchema = paginatedResponseSchema(
  calendarListItemSchema,
);

// Inferred types
export type Calendar = z.infer<typeof calendarSchema>;
export type CreateCalendarInput = z.infer<typeof createCalendarSchema>;
export type UpdateCalendarInput = z.infer<typeof updateCalendarSchema>;
export type ListCalendarsQuery = z.infer<typeof listCalendarsQuerySchema>;
export type CalendarResponse = z.infer<typeof calendarResponseSchema>;
export type CalendarWithLocation = z.infer<typeof calendarWithLocationSchema>;
export type CalendarListItem = z.infer<typeof calendarListItemSchema>;
export type CalendarListResponse = z.infer<typeof calendarListResponseSchema>;
