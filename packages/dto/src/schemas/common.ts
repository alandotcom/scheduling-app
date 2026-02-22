import { z } from "zod";

// Common validation patterns
export const uuidSchema = z.uuid("Invalid ID format");
export const timestampSchema = z.coerce.date();
export const timezoneSchema = z.string().min(1, "Timezone is required"); // IANA timezone, e.g., 'America/New_York'
export const timeSchema = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/,
    "Must be HH:MM or HH:MM:SS format",
  );
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD format");
export const weekdaySchema = z
  .number()
  .int()
  .min(0, "Weekday must be between 0 (Sunday) and 6 (Saturday)")
  .max(6, "Weekday must be between 0 (Sunday) and 6 (Saturday)");
export const positiveIntSchema = z
  .number()
  .int()
  .min(1, "Must be a positive number")
  .max(2147483647, "Must be less than or equal to 2147483647");
export const nonNegativeIntSchema = z
  .number()
  .int()
  .min(0, "Must be zero or greater")
  .max(2147483647, "Must be less than or equal to 2147483647");

// Common timestamp fields
export const timestampsSchema = z.object({
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

// Cursor-based pagination
export const paginationSchema = z.object({
  cursor: uuidSchema.optional(),
  limit: z
    .number()
    .int()
    .min(1, "Must be at least 1")
    .max(100, "Must be at most 100")
    .default(20),
});

export const paginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: uuidSchema.nullable(),
    hasMore: z.boolean(),
  });

export const successResponseSchema = z.object({
  success: z.literal(true),
});
