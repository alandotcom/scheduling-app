import { z } from "zod";

// Common validation patterns
export const uuidSchema = z.string().uuid();
export const timestampSchema = z.coerce.date();
export const timezoneSchema = z.string().min(1); // IANA timezone, e.g., 'America/New_York'
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Must be HH:MM format");
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format");
export const weekdaySchema = z.number().int().min(0).max(6);
export const positiveIntSchema = z.number().int().positive();
export const nonNegativeIntSchema = z.number().int().nonnegative();

// Common timestamp fields
export const timestampsSchema = z.object({
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

// Cursor-based pagination
export const paginationSchema = z.object({
  cursor: uuidSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: uuidSchema.nullable(),
    hasMore: z.boolean(),
  });
