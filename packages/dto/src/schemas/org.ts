import { z } from "zod";
import {
  uuidSchema,
  timestampsSchema,
  timeSchema,
  weekdaySchema,
} from "./common";

// Base org schema
export const orgSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(255),
  defaultTimezone: z.string().min(1).default("America/New_York"),
  defaultBusinessHoursStart: timeSchema.default("09:00"),
  defaultBusinessHoursEnd: timeSchema.default("17:00"),
  defaultBusinessDays: z.array(weekdaySchema).default([1, 2, 3, 4, 5]),
  notificationsEnabled: z.boolean().default(true),
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

// Update org settings input
export const updateOrgSettingsSchema = z.object({
  defaultTimezone: z.string().min(1).optional(),
  defaultBusinessHoursStart: timeSchema.optional(),
  defaultBusinessHoursEnd: timeSchema.optional(),
  defaultBusinessDays: z.array(weekdaySchema).optional(),
  notificationsEnabled: z.boolean().optional(),
});

// Response types
export const orgResponseSchema = orgSchema;

// Inferred types
export type Org = z.infer<typeof orgSchema>;
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
export type UpdateOrgSettingsInput = z.infer<typeof updateOrgSettingsSchema>;
export type OrgResponse = z.infer<typeof orgResponseSchema>;
