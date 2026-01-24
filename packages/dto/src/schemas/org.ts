import { z } from "zod";
import { uuidSchema, timestampsSchema } from "./common";

// Base org schema
export const orgSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(255),
  ...timestampsSchema.shape,
});

// Create org input
export const createOrgSchema = z.object({
  name: z.string().min(1).max(255),
});

// Update org input
export const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

// Response types
export const orgResponseSchema = orgSchema;

// Inferred types
export type Org = z.infer<typeof orgSchema>;
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
export type OrgResponse = z.infer<typeof orgResponseSchema>;
