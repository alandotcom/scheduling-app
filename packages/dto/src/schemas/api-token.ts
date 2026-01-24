import { z } from "zod";
import { uuidSchema, timestampSchema, paginationSchema } from "./common";

// Token scopes
export const tokenScopeSchema = z.enum(["admin", "staff"]);
export type TokenScope = z.infer<typeof tokenScopeSchema>;

// Create API token - returns the full token only once
export const createApiTokenSchema = z.object({
  name: z.string().min(1).max(255),
  scope: tokenScopeSchema,
  expiresAt: z.coerce.date().optional(), // Optional expiration
});

export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;

// Response when creating a token (includes full token only once)
export const createApiTokenResponseSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  scope: tokenScopeSchema,
  tokenPrefix: z.string(),
  token: z.string(), // Full token, only returned once on creation
  expiresAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});

export type CreateApiTokenResponse = z.infer<
  typeof createApiTokenResponseSchema
>;

// API token response (list/get - no full token)
export const apiTokenResponseSchema = z.object({
  id: uuidSchema,
  orgId: uuidSchema,
  userId: uuidSchema,
  name: z.string(),
  scope: tokenScopeSchema,
  tokenPrefix: z.string(),
  lastUsedAt: timestampSchema.nullable(),
  expiresAt: timestampSchema.nullable(),
  revokedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type ApiTokenResponse = z.infer<typeof apiTokenResponseSchema>;

// List API tokens query
export const listApiTokensQuerySchema = paginationSchema.extend({
  includeRevoked: z.boolean().optional().default(false),
});

export type ListApiTokensQuery = z.infer<typeof listApiTokensQuerySchema>;

// Revoke API token - no extra input needed, just the ID
export const revokeApiTokenSchema = z.object({
  id: uuidSchema,
});

export type RevokeApiTokenInput = z.infer<typeof revokeApiTokenSchema>;

// Update API token (only name can be updated)
export const updateApiTokenSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

export type UpdateApiTokenInput = z.infer<typeof updateApiTokenSchema>;
