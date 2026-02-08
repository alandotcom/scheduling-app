import { z } from "zod";
import {
  uuidSchema,
  timestampsSchema,
  timestampSchema,
  timezoneSchema,
  dateSchema,
} from "./common";

// Appointment status enum
export const appointmentStatusSchema = z.enum([
  "scheduled",
  "confirmed",
  "cancelled",
  "no_show",
]);

export const appointmentListScopeSchema = z.enum([
  "upcoming",
  "history",
  "all",
]);

// Base appointment schema
export const appointmentSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  calendarId: uuidSchema,
  appointmentTypeId: uuidSchema,
  clientId: uuidSchema.nullable(),
  startAt: timestampSchema,
  endAt: timestampSchema,
  timezone: timezoneSchema,
  status: appointmentStatusSchema,
  notes: z.string().nullable(),
  ...timestampsSchema.shape,
});

// Create appointment input
export const createAppointmentSchema = z.object({
  calendarId: uuidSchema,
  appointmentTypeId: uuidSchema,
  startTime: timestampSchema, // UTC timestamp
  timezone: timezoneSchema,
  clientId: uuidSchema.optional(),
  notes: z.string().optional(),
});

// Update appointment input (notes/client only - use reschedule for time changes)
export const updateAppointmentSchema = z.object({
  clientId: uuidSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Reschedule appointment input
export const rescheduleAppointmentSchema = z.object({
  newStartTime: timestampSchema,
  timezone: timezoneSchema,
});

// Cancel appointment input
export const cancelAppointmentSchema = z.object({
  reason: z.string().optional(),
});

// List appointments query
export const listAppointmentsQuerySchema = z.object({
  calendarId: uuidSchema.optional(),
  appointmentTypeId: uuidSchema.optional(),
  clientId: uuidSchema.optional(),
  status: appointmentStatusSchema.optional(),
  scope: appointmentListScopeSchema.optional(),
  boundaryAt: timestampSchema.optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  cursor: uuidSchema.optional(),
  limit: z
    .number()
    .int()
    .min(1, "Must be at least 1")
    .max(100, "Must be at most 100")
    .default(20),
});

// Time-range appointments query (schedule view)
export const appointmentTimeRangeQuerySchema = z
  .object({
    startAt: timestampSchema,
    endAt: timestampSchema,
    calendarId: uuidSchema.optional(),
    appointmentTypeId: uuidSchema.optional(),
    clientId: uuidSchema.optional(),
    status: appointmentStatusSchema.optional(),
    cursor: uuidSchema.optional(),
    limit: z
      .number()
      .int()
      .min(1, "Must be at least 1")
      .max(1000, "Must be at most 1000")
      .default(500),
  })
  .refine((data) => data.startAt < data.endAt, {
    message: "startAt must be before endAt",
    path: ["startAt"],
  });

// Schedule grid event fields
export const appointmentScheduleEventSchema = z.object({
  id: uuidSchema,
  status: appointmentStatusSchema,
  startAt: timestampSchema,
  endAt: timestampSchema,
  calendarId: uuidSchema,
  calendarColor: z.string().nullable().optional(),
  clientName: z.string().nullable(),
  appointmentTypeName: z.string().nullable(),
  locationName: z.string().nullable(),
  hasNotes: z.boolean(),
  resourceSummary: z.string().nullable(),
});

export const appointmentTimeRangeResponseSchema = z.object({
  items: z.array(appointmentScheduleEventSchema),
  nextCursor: uuidSchema.nullable(),
  hasMore: z.boolean(),
});

// Conflict metadata (reschedule/create)
export const appointmentConflictTypeSchema = z.enum([
  "unavailable",
  "overlap",
  "resource_unavailable",
  "capacity",
]);

export const appointmentConflictSchema = z.object({
  conflictType: appointmentConflictTypeSchema,
  message: z.string(),
  canOverride: z.boolean(),
  conflictingIds: z.array(uuidSchema),
});

// Response types with optional relations
export const appointmentResponseSchema = appointmentSchema;

export const appointmentWithRelationsSchema = appointmentSchema.extend({
  calendar: z
    .object({
      id: uuidSchema,
      name: z.string(),
      timezone: timezoneSchema,
    })
    .optional(),
  appointmentType: z
    .object({
      id: uuidSchema,
      name: z.string(),
      durationMin: z.number(),
    })
    .optional(),
  client: z
    .object({
      id: uuidSchema,
      firstName: z.string(),
      lastName: z.string(),
      email: z.string().nullable(),
    })
    .optional()
    .nullable(),
});

// List appointments response
export const appointmentListResponseSchema = z.object({
  items: z.array(appointmentWithRelationsSchema),
  nextCursor: uuidSchema.nullable(),
  hasMore: z.boolean(),
});

// Inferred types
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;
export type AppointmentListScope = z.infer<typeof appointmentListScopeSchema>;
export type Appointment = z.infer<typeof appointmentSchema>;
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type RescheduleAppointmentInput = z.infer<
  typeof rescheduleAppointmentSchema
>;
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;
export type AppointmentTimeRangeQuery = z.infer<
  typeof appointmentTimeRangeQuerySchema
>;
export type AppointmentScheduleEvent = z.infer<
  typeof appointmentScheduleEventSchema
>;
export type AppointmentTimeRangeResponse = z.infer<
  typeof appointmentTimeRangeResponseSchema
>;
export type AppointmentConflictType = z.infer<
  typeof appointmentConflictTypeSchema
>;
export type AppointmentConflict = z.infer<typeof appointmentConflictSchema>;
export type AppointmentResponse = z.infer<typeof appointmentResponseSchema>;
export type AppointmentWithRelations = z.infer<
  typeof appointmentWithRelationsSchema
>;
export type AppointmentListResponse = z.infer<
  typeof appointmentListResponseSchema
>;
