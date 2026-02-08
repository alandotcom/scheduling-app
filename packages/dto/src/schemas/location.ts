import { z } from "zod";
import {
  uuidSchema,
  timestampsSchema,
  timezoneSchema,
  nonNegativeIntSchema,
  paginatedResponseSchema,
} from "./common";

// Base location schema
export const locationSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  timezone: timezoneSchema,
  ...timestampsSchema.shape,
});

// Create location input
export const createLocationSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  timezone: timezoneSchema,
});

// Update location input
export const updateLocationSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name is too long")
    .optional(),
  timezone: timezoneSchema.optional(),
});

// List locations query
export const listLocationsQuerySchema = z.object({
  cursor: uuidSchema.optional(),
  limit: z
    .number()
    .int()
    .min(1, "Must be at least 1")
    .max(100, "Must be at most 100")
    .default(20),
});

// Response types
export const locationResponseSchema = locationSchema;
export const locationListItemSchema = locationSchema.extend({
  relationshipCounts: z.object({
    calendars: nonNegativeIntSchema,
    resources: nonNegativeIntSchema,
  }),
});
export const locationListResponseSchema = paginatedResponseSchema(
  locationListItemSchema,
);

// Inferred types
export type Location = z.infer<typeof locationSchema>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type ListLocationsQuery = z.infer<typeof listLocationsQuerySchema>;
export type LocationResponse = z.infer<typeof locationResponseSchema>;
export type LocationListItem = z.infer<typeof locationListItemSchema>;
export type LocationListResponse = z.infer<typeof locationListResponseSchema>;
