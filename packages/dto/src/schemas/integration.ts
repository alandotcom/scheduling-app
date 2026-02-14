import { z } from "zod";
import { successResponseSchema } from "./common";

export const appIntegrationKeySchema = z.enum(["logger", "resend", "slack"]);
export type AppIntegrationKey = z.infer<typeof appIntegrationKeySchema>;

export const integrationAuthStrategySchema = z.enum(["manual", "oauth"]);
export type IntegrationAuthStrategy = z.infer<
  typeof integrationAuthStrategySchema
>;

export const integrationOAuthStatusSchema = z.object({
  connected: z.boolean(),
  connectedAt: z.string().nullable(),
  accountLabel: z.string().nullable(),
  canDisconnect: z.boolean().default(true),
});
export type IntegrationOAuthStatus = z.infer<
  typeof integrationOAuthStatusSchema
>;

export const integrationSummarySchema = z.object({
  key: appIntegrationKeySchema,
  name: z.string().min(1),
  description: z.string().min(1),
  logoUrl: z.url().nullable(),
  enabled: z.boolean(),
  configured: z.boolean(),
  hasSettingsPanel: z.boolean(),
  authStrategy: integrationAuthStrategySchema.default("manual"),
});
export type IntegrationSummary = z.infer<typeof integrationSummarySchema>;

export const integrationConfigFieldInputTypeSchema = z.enum([
  "text",
  "url",
  "email",
]);
export type IntegrationConfigFieldInputType = z.infer<
  typeof integrationConfigFieldInputTypeSchema
>;

export const integrationConfigFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
  inputType: integrationConfigFieldInputTypeSchema.default("text"),
});
export type IntegrationConfigField = z.infer<
  typeof integrationConfigFieldSchema
>;

export const integrationSecretFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
});
export type IntegrationSecretField = z.infer<
  typeof integrationSecretFieldSchema
>;

export const integrationsListResponseSchema = z.object({
  items: z.array(integrationSummarySchema),
});
export type IntegrationsListResponse = z.infer<
  typeof integrationsListResponseSchema
>;

export const integrationSettingsSchema = integrationSummarySchema.extend({
  config: z.record(z.string(), z.unknown()),
  secretFields: z.record(z.string(), z.boolean()),
  configSchema: z.array(integrationConfigFieldSchema).default([]),
  secretSchema: z.array(integrationSecretFieldSchema).default([]),
  oauth: integrationOAuthStatusSchema.optional(),
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

export const updateIntegrationSecretsInputSchema = z
  .object({
    key: appIntegrationKeySchema,
    set: z.record(z.string(), z.string().min(1)).optional(),
    clear: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (value) => {
      const setCount = value.set ? Object.keys(value.set).length : 0;
      const clearCount = value.clear ? value.clear.length : 0;
      return setCount > 0 || clearCount > 0;
    },
    {
      message: "At least one secret update operation must be provided",
      path: ["set"],
    },
  );
export type UpdateIntegrationSecretsInput = z.infer<
  typeof updateIntegrationSecretsInputSchema
>;

export const updateIntegrationSecretsResponseSchema = successResponseSchema;
export type UpdateIntegrationSecretsResponse = z.infer<
  typeof updateIntegrationSecretsResponseSchema
>;

export const disconnectIntegrationOAuthInputSchema = z.object({
  key: appIntegrationKeySchema,
});
export type DisconnectIntegrationOAuthInput = z.infer<
  typeof disconnectIntegrationOAuthInputSchema
>;

export const disconnectIntegrationOAuthResponseSchema = successResponseSchema;
export type DisconnectIntegrationOAuthResponse = z.infer<
  typeof disconnectIntegrationOAuthResponseSchema
>;
