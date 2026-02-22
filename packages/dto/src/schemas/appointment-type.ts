import { z } from "zod";
import {
  uuidSchema,
  timestampsSchema,
  positiveIntSchema,
  nonNegativeIntSchema,
  paginatedResponseSchema,
  timezoneSchema,
} from "./common";
import { calendarSchema } from "./calendar";
import { resourceSchema } from "./resource";

// Base appointment type schema
export const appointmentTypeSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  durationMin: positiveIntSchema,
  paddingBeforeMin: nonNegativeIntSchema.nullable(),
  paddingAfterMin: nonNegativeIntSchema.nullable(),
  capacity: positiveIntSchema.nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  ...timestampsSchema.shape,
});

// Create appointment type input
export const createAppointmentTypeSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  durationMin: positiveIntSchema,
  paddingBeforeMin: nonNegativeIntSchema.optional(),
  paddingAfterMin: nonNegativeIntSchema.optional(),
  capacity: positiveIntSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Update appointment type input
export const updateAppointmentTypeSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name is too long")
    .optional(),
  durationMin: positiveIntSchema.optional(),
  paddingBeforeMin: nonNegativeIntSchema.nullable().optional(),
  paddingAfterMin: nonNegativeIntSchema.nullable().optional(),
  capacity: positiveIntSchema.nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

// List appointment types query
export const listAppointmentTypesQuerySchema = z.object({
  cursor: uuidSchema.optional(),
  limit: z
    .number()
    .int()
    .min(1, "Must be at least 1")
    .max(100, "Must be at most 100")
    .default(20),
});

// Appointment type <-> calendar join
export const appointmentTypeCalendarSchema = z.object({
  id: uuidSchema,
  appointmentTypeId: uuidSchema,
  calendarId: uuidSchema,
});
export const appointmentTypeCalendarAssociationSchema =
  appointmentTypeCalendarSchema.extend({
    calendar: calendarSchema,
  });

export const createAppointmentTypeCalendarSchema = z.object({
  calendarId: uuidSchema.describe(
    "ID of an existing calendar to link to the appointment type.",
  ),
});

// Appointment type <-> resource join
export const appointmentTypeResourceSchema = z.object({
  id: uuidSchema,
  appointmentTypeId: uuidSchema,
  resourceId: uuidSchema,
  quantityRequired: positiveIntSchema,
});
export const appointmentTypeResourceAssociationSchema =
  appointmentTypeResourceSchema.extend({
    resource: resourceSchema,
  });

export const createAppointmentTypeResourceSchema = z.object({
  resourceId: uuidSchema.describe(
    "ID of an existing resource to link to the appointment type.",
  ),
  quantityRequired: positiveIntSchema
    .optional()
    .default(1)
    .describe("Quantity of this resource required for each appointment."),
});

export const updateAppointmentTypeResourceSchema = z.object({
  quantityRequired: positiveIntSchema.optional(),
});

// Response types
export const appointmentTypeResponseSchema = appointmentTypeSchema;
export const appointmentTypeWithLinksSchema = appointmentTypeSchema.extend({
  calendars: z.array(
    z.object({
      id: uuidSchema,
      name: z.string(),
      timezone: timezoneSchema,
    }),
  ),
  resources: z.array(
    z.object({
      id: uuidSchema,
      name: z.string(),
      quantityRequired: positiveIntSchema,
    }),
  ),
});
export const appointmentTypeListItemSchema = appointmentTypeSchema.extend({
  relationshipCounts: z.object({
    calendars: nonNegativeIntSchema,
    resources: nonNegativeIntSchema,
    appointments: nonNegativeIntSchema,
  }),
});
export const appointmentTypeListResponseSchema = paginatedResponseSchema(
  appointmentTypeListItemSchema,
);

// Inferred types
export type AppointmentType = z.infer<typeof appointmentTypeSchema>;
export type CreateAppointmentTypeInput = z.infer<
  typeof createAppointmentTypeSchema
>;
export type UpdateAppointmentTypeInput = z.infer<
  typeof updateAppointmentTypeSchema
>;
export type ListAppointmentTypesQuery = z.infer<
  typeof listAppointmentTypesQuerySchema
>;
export type AppointmentTypeResponse = z.infer<
  typeof appointmentTypeResponseSchema
>;
export type AppointmentTypeWithLinks = z.infer<
  typeof appointmentTypeWithLinksSchema
>;
export type AppointmentTypeListItem = z.infer<
  typeof appointmentTypeListItemSchema
>;
export type AppointmentTypeListResponse = z.infer<
  typeof appointmentTypeListResponseSchema
>;
export type AppointmentTypeCalendar = z.infer<
  typeof appointmentTypeCalendarSchema
>;
export type AppointmentTypeCalendarAssociation = z.infer<
  typeof appointmentTypeCalendarAssociationSchema
>;
export type CreateAppointmentTypeCalendarInput = z.infer<
  typeof createAppointmentTypeCalendarSchema
>;
export type AppointmentTypeResource = z.infer<
  typeof appointmentTypeResourceSchema
>;
export type AppointmentTypeResourceAssociation = z.infer<
  typeof appointmentTypeResourceAssociationSchema
>;
export type CreateAppointmentTypeResourceInput = z.infer<
  typeof createAppointmentTypeResourceSchema
>;
export type UpdateAppointmentTypeResourceInput = z.infer<
  typeof updateAppointmentTypeResourceSchema
>;
