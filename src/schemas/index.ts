import { z } from "zod";

// Common schemas
export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});

export const metadataSchema = z.record(z.unknown()).default({});

// Timezone validation (IANA timezone names)
export const timezoneSchema = z.string().refine(
  (tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid IANA timezone" }
);

// Location schemas
export const createLocationSchema = z.object({
  name: z.string().min(1).max(255),
  address: z.string().max(500).optional(),
  timezone: timezoneSchema.default("UTC"),
  metadata: metadataSchema,
});

export const updateLocationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  address: z.string().max(500).nullable().optional(),
  timezone: timezoneSchema.optional(),
  metadata: metadataSchema.optional(),
});

export type CreateLocation = z.infer<typeof createLocationSchema>;
export type UpdateLocation = z.infer<typeof updateLocationSchema>;

// Calendar schemas
export const createCalendarSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  location_id: uuidSchema.optional(),
  timezone: timezoneSchema.default("UTC"),
  is_active: z.boolean().default(true),
  metadata: metadataSchema,
});

export const updateCalendarSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  location_id: uuidSchema.nullable().optional(),
  timezone: timezoneSchema.optional(),
  is_active: z.boolean().optional(),
  metadata: metadataSchema.optional(),
});

export type CreateCalendar = z.infer<typeof createCalendarSchema>;
export type UpdateCalendar = z.infer<typeof updateCalendarSchema>;

// Resource schemas
export const createResourceSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  location_id: uuidSchema.optional(),
  quantity: z.number().int().min(1).default(1),
  is_active: z.boolean().default(true),
  metadata: metadataSchema,
});

export const updateResourceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  location_id: uuidSchema.nullable().optional(),
  quantity: z.number().int().min(1).optional(),
  is_active: z.boolean().optional(),
  metadata: metadataSchema.optional(),
});

export type CreateResource = z.infer<typeof createResourceSchema>;
export type UpdateResource = z.infer<typeof updateResourceSchema>;

// Appointment type schemas
export const createAppointmentTypeSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  duration_min: z.number().int().min(1),
  padding_before_min: z.number().int().min(0).default(0),
  padding_after_min: z.number().int().min(0).default(0),
  capacity: z.number().int().min(1).default(1),
  price_cents: z.number().int().min(0).optional(),
  color: z.string().max(50).optional(),
  is_active: z.boolean().default(true),
  calendar_ids: z.array(uuidSchema).optional(),
  metadata: metadataSchema,
});

export const updateAppointmentTypeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  duration_min: z.number().int().min(1).optional(),
  padding_before_min: z.number().int().min(0).optional(),
  padding_after_min: z.number().int().min(0).optional(),
  capacity: z.number().int().min(1).optional(),
  price_cents: z.number().int().min(0).nullable().optional(),
  color: z.string().max(50).nullable().optional(),
  is_active: z.boolean().optional(),
  metadata: metadataSchema.optional(),
});

export const assignCalendarSchema = z.object({
  calendar_id: uuidSchema,
});

export const assignResourceSchema = z.object({
  resource_id: uuidSchema,
  quantity_required: z.number().int().min(1).default(1),
});

export type CreateAppointmentType = z.infer<typeof createAppointmentTypeSchema>;
export type UpdateAppointmentType = z.infer<typeof updateAppointmentTypeSchema>;
