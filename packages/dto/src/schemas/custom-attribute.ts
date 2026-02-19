import { z } from "zod";
import { uuidSchema, timestampsSchema } from "./common";

// Attribute type enum
export const customAttributeTypeSchema = z.enum([
  "TEXT",
  "NUMBER",
  "DATE",
  "BOOLEAN",
  "SELECT",
  "MULTI_SELECT",
]);

export type CustomAttributeType = z.infer<typeof customAttributeTypeSchema>;

// ─── Definition schemas ───

export const customAttributeDefinitionSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  fieldKey: z.string(),
  label: z.string(),
  type: customAttributeTypeSchema,
  slotColumn: z.string(),
  required: z.boolean(),
  options: z.array(z.string()).nullable(),
  displayOrder: z.number().int(),
  ...timestampsSchema.shape,
});

export const createCustomAttributeDefinitionSchema = z
  .object({
    fieldKey: z
      .string()
      .min(1, "Field key is required")
      .max(100, "Field key is too long")
      .regex(
        /^[a-zA-Z][a-zA-Z0-9_]*$/,
        "Field key must start with a letter and contain only letters, numbers, and underscores",
      ),
    label: z.string().min(1, "Label is required").max(255, "Label is too long"),
    type: customAttributeTypeSchema,
    required: z.boolean().optional().default(false),
    options: z.array(z.string().min(1).max(255)).optional(),
    displayOrder: z.number().int().nonnegative().optional().default(0),
  })
  .refine(
    (data) => {
      if (data.type === "SELECT" || data.type === "MULTI_SELECT") {
        return data.options && data.options.length > 0;
      }
      return true;
    },
    {
      message: "Options are required for SELECT and MULTI_SELECT types",
      path: ["options"],
    },
  );

export const updateCustomAttributeDefinitionSchema = z.object({
  label: z
    .string()
    .min(1, "Label is required")
    .max(255, "Label is too long")
    .optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().min(1).max(255)).optional(),
  displayOrder: z.number().int().nonnegative().optional(),
});

export const customAttributeDefinitionResponseSchema =
  customAttributeDefinitionSchema.omit({ slotColumn: true });

// ─── Value schemas ───

// Values are a Record<fieldKey, value> where value depends on the attribute type.
// Dates are represented as ISO strings at the API boundary.
export const customAttributeValuesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
);

export type CustomAttributeValues = z.infer<typeof customAttributeValuesSchema>;

// ─── Slot usage schema ───

const slotBucketSchema = z.object({
  used: z.number().int(),
  total: z.number().int(),
});

export const slotUsageSchema = z.object({
  t: slotBucketSchema,
  n: slotBucketSchema,
  d: slotBucketSchema,
  b: slotBucketSchema,
  j: slotBucketSchema,
});

// ─── Inferred types ───

export type CustomAttributeDefinition = z.infer<
  typeof customAttributeDefinitionSchema
>;
export type CreateCustomAttributeDefinitionInput = z.infer<
  typeof createCustomAttributeDefinitionSchema
>;
export type UpdateCustomAttributeDefinitionInput = z.infer<
  typeof updateCustomAttributeDefinitionSchema
>;
export type SlotUsage = z.infer<typeof slotUsageSchema>;
