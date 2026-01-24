import { z } from "zod";
import { uuidSchema, timestampsSchema, positiveIntSchema } from "./common";

// Base resource schema
export const resourceSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  locationId: uuidSchema.nullable(),
  name: z.string().min(1).max(255),
  quantity: positiveIntSchema,
  ...timestampsSchema.shape,
});

// Create resource input
export const createResourceSchema = z.object({
  locationId: uuidSchema.optional(),
  name: z.string().min(1).max(255),
  quantity: positiveIntSchema.optional().default(1),
});

// Update resource input
export const updateResourceSchema = z.object({
  locationId: uuidSchema.nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  quantity: positiveIntSchema.optional(),
});

// List resources query
export const listResourcesQuerySchema = z.object({
  locationId: uuidSchema.optional(),
  cursor: uuidSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

// Response types
export const resourceResponseSchema = resourceSchema;

// Inferred types
export type Resource = z.infer<typeof resourceSchema>;
export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
export type ListResourcesQuery = z.infer<typeof listResourcesQuerySchema>;
export type ResourceResponse = z.infer<typeof resourceResponseSchema>;
