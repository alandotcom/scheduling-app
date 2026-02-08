import { z } from "zod";
import { timestampSchema, uuidSchema } from "./common";

export const apiKeyScopeSchema = z.enum(["owner", "admin", "member"]);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  scope: apiKeyScopeSchema,
  expiresAt: z.coerce.date().optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const revokeApiKeySchema = z.object({
  id: uuidSchema,
});
export type RevokeApiKeyInput = z.infer<typeof revokeApiKeySchema>;

export const apiKeyResponseSchema = z.object({
  id: uuidSchema,
  name: z.string().nullable(),
  prefix: z.string().nullable(),
  start: z.string().nullable(),
  scope: apiKeyScopeSchema,
  organizationId: uuidSchema,
  expiresAt: timestampSchema.nullable(),
  lastUsedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type ApiKeyResponse = z.infer<typeof apiKeyResponseSchema>;

export const apiKeyListResponseSchema = z.object({
  items: z.array(apiKeyResponseSchema),
});
export type ApiKeyListResponse = z.infer<typeof apiKeyListResponseSchema>;

export const createApiKeyResponseSchema = apiKeyResponseSchema.extend({
  key: z.string(),
});
export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;
