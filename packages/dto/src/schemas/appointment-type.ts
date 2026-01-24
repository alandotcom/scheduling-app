import { z } from 'zod'
import { uuidSchema, timestampsSchema, positiveIntSchema, nonNegativeIntSchema } from './common'

// Base appointment type schema
export const appointmentTypeSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  name: z.string().min(1).max(255),
  durationMin: positiveIntSchema,
  paddingBeforeMin: nonNegativeIntSchema.nullable(),
  paddingAfterMin: nonNegativeIntSchema.nullable(),
  capacity: positiveIntSchema.nullable(),
  metadata: z.record(z.unknown()).nullable(),
  ...timestampsSchema.shape,
})

// Create appointment type input
export const createAppointmentTypeSchema = z.object({
  name: z.string().min(1).max(255),
  durationMin: positiveIntSchema,
  paddingBeforeMin: nonNegativeIntSchema.optional(),
  paddingAfterMin: nonNegativeIntSchema.optional(),
  capacity: positiveIntSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
})

// Update appointment type input
export const updateAppointmentTypeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  durationMin: positiveIntSchema.optional(),
  paddingBeforeMin: nonNegativeIntSchema.nullable().optional(),
  paddingAfterMin: nonNegativeIntSchema.nullable().optional(),
  capacity: positiveIntSchema.nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
})

// List appointment types query
export const listAppointmentTypesQuerySchema = z.object({
  cursor: uuidSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
})

// Appointment type <-> calendar join
export const appointmentTypeCalendarSchema = z.object({
  id: uuidSchema,
  appointmentTypeId: uuidSchema,
  calendarId: uuidSchema,
})

export const createAppointmentTypeCalendarSchema = z.object({
  calendarId: uuidSchema,
})

// Appointment type <-> resource join
export const appointmentTypeResourceSchema = z.object({
  id: uuidSchema,
  appointmentTypeId: uuidSchema,
  resourceId: uuidSchema,
  quantityRequired: positiveIntSchema,
})

export const createAppointmentTypeResourceSchema = z.object({
  resourceId: uuidSchema,
  quantityRequired: positiveIntSchema.optional().default(1),
})

export const updateAppointmentTypeResourceSchema = z.object({
  quantityRequired: positiveIntSchema.optional(),
})

// Response types
export const appointmentTypeResponseSchema = appointmentTypeSchema

// Inferred types
export type AppointmentType = z.infer<typeof appointmentTypeSchema>
export type CreateAppointmentTypeInput = z.infer<typeof createAppointmentTypeSchema>
export type UpdateAppointmentTypeInput = z.infer<typeof updateAppointmentTypeSchema>
export type ListAppointmentTypesQuery = z.infer<typeof listAppointmentTypesQuerySchema>
export type AppointmentTypeResponse = z.infer<typeof appointmentTypeResponseSchema>
export type AppointmentTypeCalendar = z.infer<typeof appointmentTypeCalendarSchema>
export type CreateAppointmentTypeCalendarInput = z.infer<typeof createAppointmentTypeCalendarSchema>
export type AppointmentTypeResource = z.infer<typeof appointmentTypeResourceSchema>
export type CreateAppointmentTypeResourceInput = z.infer<typeof createAppointmentTypeResourceSchema>
export type UpdateAppointmentTypeResourceInput = z.infer<typeof updateAppointmentTypeResourceSchema>
