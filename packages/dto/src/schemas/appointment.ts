import { z } from "zod";
import {
  uuidSchema,
  timestampsSchema,
  timestampSchema,
  timezoneSchema,
  dateSchema,
} from "./common";

// Appointment status enum
export const appointmentStatusSchema = z.enum(["scheduled", "confirmed", "cancelled", "no_show"]);

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
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  cursor: uuidSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
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

// Inferred types
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;
export type Appointment = z.infer<typeof appointmentSchema>;
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;
export type AppointmentResponse = z.infer<typeof appointmentResponseSchema>;
export type AppointmentWithRelations = z.infer<typeof appointmentWithRelationsSchema>;
