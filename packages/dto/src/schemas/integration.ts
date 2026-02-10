import { z } from "zod";
import { successResponseSchema } from "./common";

export const appIntegrationKeySchema = z.enum(["logger"]);
export type AppIntegrationKey = z.infer<typeof appIntegrationKeySchema>;

export const integrationSummarySchema = z.object({
  key: appIntegrationKeySchema,
  name: z.string().min(1),
  description: z.string().min(1),
  logoUrl: z.url().nullable(),
  enabled: z.boolean(),
  configured: z.boolean(),
  hasSettingsPanel: z.boolean(),
});
export type IntegrationSummary = z.infer<typeof integrationSummarySchema>;

export const integrationsListResponseSchema = z.object({
  items: z.array(integrationSummarySchema),
});
export type IntegrationsListResponse = z.infer<
  typeof integrationsListResponseSchema
>;

export const integrationSettingsSchema = integrationSummarySchema.extend({
  config: z.record(z.string(), z.unknown()),
  secretFields: z.record(z.string(), z.boolean()),
});
export type IntegrationSettings = z.infer<typeof integrationSettingsSchema>;

export const getIntegrationSettingsInputSchema = z.object({
  key: appIntegrationKeySchema,
});
export type GetIntegrationSettingsInput = z.infer<
  typeof getIntegrationSettingsInputSchema
>;

export const updateIntegrationInputSchema = z
  .object({
    key: appIntegrationKeySchema,
    enabled: z.boolean().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (value) => value.enabled !== undefined || value.config !== undefined,
    {
      message: "At least one update field must be provided",
      path: ["enabled"],
    },
  );
export type UpdateIntegrationInput = z.infer<
  typeof updateIntegrationInputSchema
>;

export const updateIntegrationSecretsInputSchema = z.object({
  key: appIntegrationKeySchema,
  secrets: z.record(z.string(), z.string().min(1)),
});
export type UpdateIntegrationSecretsInput = z.infer<
  typeof updateIntegrationSecretsInputSchema
>;

export const updateIntegrationSecretsResponseSchema = successResponseSchema;
export type UpdateIntegrationSecretsResponse = z.infer<
  typeof updateIntegrationSecretsResponseSchema
>;
