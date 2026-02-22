import { z } from "zod";
import { nonNegativeIntSchema, uuidSchema, timestampsSchema } from "./common";

const fieldKeySchema = z
  .string()
  .min(1, "Field key is required")
  .max(100, "Field key is too long")
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_]*$/,
    "Field key must start with a letter and contain only letters, numbers, and underscores",
  );

// Attribute type enum
export const customAttributeTypeSchema = z.enum([
  "TEXT",
  "NUMBER",
  "DATE",
  "BOOLEAN",
  "SELECT",
  "MULTI_SELECT",
  "RELATION_CLIENT",
]);

export type CustomAttributeType = z.infer<typeof customAttributeTypeSchema>;

export const customAttributeRelationTargetEntitySchema = z.enum(["CLIENT"]);
export type CustomAttributeRelationTargetEntity = z.infer<
  typeof customAttributeRelationTargetEntitySchema
>;

export const customAttributeRelationValueModeSchema = z.enum([
  "single",
  "multi",
]);
export type CustomAttributeRelationValueMode = z.infer<
  typeof customAttributeRelationValueModeSchema
>;

export const customAttributeRelationPairedRoleSchema = z.enum([
  "forward",
  "reverse",
]);
export type CustomAttributeRelationPairedRole = z.infer<
  typeof customAttributeRelationPairedRoleSchema
>;

export const customAttributeRelationConfigSchema = z.object({
  targetEntity: customAttributeRelationTargetEntitySchema,
  valueMode: customAttributeRelationValueModeSchema,
  pairedDefinitionId: uuidSchema.nullable(),
  pairedRole: customAttributeRelationPairedRoleSchema.nullable(),
});

export type CustomAttributeRelationConfig = z.infer<
  typeof customAttributeRelationConfigSchema
>;

export const customAttributeRelationConfigInputSchema = z.object({
  targetEntity: customAttributeRelationTargetEntitySchema
    .optional()
    .default("CLIENT"),
  valueMode: customAttributeRelationValueModeSchema,
});

export const createCustomAttributeReverseDefinitionSchema = z.object({
  fieldKey: fieldKeySchema,
  label: z.string().min(1, "Label is required").max(255, "Label is too long"),
  valueMode: customAttributeRelationValueModeSchema,
  required: z.boolean().optional().default(false),
});

// ─── Definition schemas ───

export const customAttributeDefinitionSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  fieldKey: z.string(),
  label: z.string(),
  type: customAttributeTypeSchema,
  slotColumn: z.string().nullable(),
  required: z.boolean(),
  options: z.array(z.string()).nullable(),
  relationConfig: customAttributeRelationConfigSchema.nullable().optional(),
  displayOrder: nonNegativeIntSchema,
  ...timestampsSchema.shape,
});

export const createCustomAttributeDefinitionSchema = z
  .object({
    fieldKey: fieldKeySchema,
    label: z.string().min(1, "Label is required").max(255, "Label is too long"),
    type: customAttributeTypeSchema,
    required: z.boolean().optional().default(false),
    options: z.array(z.string().min(1).max(255)).optional(),
    relationConfig: customAttributeRelationConfigInputSchema.optional(),
    reverseRelation: createCustomAttributeReverseDefinitionSchema.optional(),
    displayOrder: nonNegativeIntSchema.optional().default(0),
  })
  .superRefine((data, ctx) => {
    const isSelectType = data.type === "SELECT" || data.type === "MULTI_SELECT";
    const isRelationType = data.type === "RELATION_CLIENT";

    if (isSelectType && (!data.options || data.options.length === 0)) {
      ctx.addIssue({
        code: "custom",
        message: "Options are required for SELECT and MULTI_SELECT types",
        path: ["options"],
      });
    }

    if (!isSelectType && data.options !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Options are only supported for SELECT and MULTI_SELECT types",
        path: ["options"],
      });
    }

    if (isRelationType && !data.relationConfig) {
      ctx.addIssue({
        code: "custom",
        message: "relationConfig is required for RELATION_CLIENT type",
        path: ["relationConfig"],
      });
    }

    if (!isRelationType && data.relationConfig !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "relationConfig is only supported for RELATION_CLIENT type",
        path: ["relationConfig"],
      });
    }

    if (!isRelationType && data.reverseRelation !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "reverseRelation is only supported for RELATION_CLIENT type",
        path: ["reverseRelation"],
      });
    }

    if (
      isRelationType &&
      data.reverseRelation &&
      data.reverseRelation.fieldKey === data.fieldKey
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "reverseRelation field key must differ from the primary field key",
        path: ["reverseRelation", "fieldKey"],
      });
    }
  });

export const updateCustomAttributeDefinitionSchema = z.object({
  label: z
    .string()
    .min(1, "Label is required")
    .max(255, "Label is too long")
    .optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().min(1).max(255)).optional(),
  displayOrder: nonNegativeIntSchema.optional(),
});

export const reorderCustomAttributeDefinitionsSchema = z.object({
  orderedIds: z.array(uuidSchema).min(1),
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
  used: nonNegativeIntSchema,
  total: nonNegativeIntSchema,
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
export type CreateCustomAttributeReverseDefinitionInput = z.infer<
  typeof createCustomAttributeReverseDefinitionSchema
>;
export type UpdateCustomAttributeDefinitionInput = z.infer<
  typeof updateCustomAttributeDefinitionSchema
>;
export type CustomAttributeDefinitionResponse = z.infer<
  typeof customAttributeDefinitionResponseSchema
>;
export type SlotUsage = z.infer<typeof slotUsageSchema>;
export type ReorderCustomAttributeDefinitionsInput = z.infer<
  typeof reorderCustomAttributeDefinitionsSchema
>;
