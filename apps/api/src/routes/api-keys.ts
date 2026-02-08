// oRPC routes for Better Auth API key management
// - Admins can create/list/revoke API keys scoped to the active organization

import { z } from "zod";
import {
  apiKeyListResponseSchema,
  apiKeyResponseSchema,
  apiKeyScopeSchema,
  createApiKeyResponseSchema,
  createApiKeySchema,
  revokeApiKeySchema,
  successResponseSchema,
} from "@scheduling/dto";
import { adminOnly } from "./base.js";
import { auth } from "../lib/auth.js";
import { ApplicationError } from "../errors/application-error.js";

const apiKeyMetadataSchema = z.object({
  organizationId: z.string().uuid(),
  role: apiKeyScopeSchema.optional(),
});

function parseMetadata(metadata: unknown) {
  if (!metadata) return null;

  if (typeof metadata === "string") {
    try {
      return apiKeyMetadataSchema.parse(JSON.parse(metadata));
    } catch {
      return null;
    }
  }

  try {
    return apiKeyMetadataSchema.parse(metadata);
  } catch {
    return null;
  }
}

function roleRank(role: "owner" | "admin" | "member"): number {
  if (role === "owner") return 3;
  if (role === "admin") return 2;
  return 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveErrorMessage(error: unknown, fallbackMessage: string): string {
  if (!isRecord(error)) {
    return fallbackMessage;
  }

  const directMessage = error["message"];
  if (typeof directMessage === "string" && directMessage.length > 0) {
    return directMessage;
  }

  const body = error["body"];
  if (!isRecord(body)) {
    return fallbackMessage;
  }

  const bodyMessage = body["message"];
  if (typeof bodyMessage === "string" && bodyMessage.length > 0) {
    return bodyMessage;
  }

  return fallbackMessage;
}

function parseBetterAuthError(
  error: unknown,
  fallbackMessage: string,
): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  return new ApplicationError(resolveErrorMessage(error, fallbackMessage), {
    code: "BAD_REQUEST",
  });
}

// List API keys for the current user, filtered to the active organization
export const list = adminOnly
  .route({ method: "GET", path: "/api-keys" })
  .output(apiKeyListResponseSchema)
  .handler(async ({ context }) => {
    try {
      const keys = await auth.api.listApiKeys({
        headers: context.headers,
      });

      const items = keys
        .flatMap((key) => {
          const metadata = parseMetadata(key.metadata);
          if (!metadata || metadata.organizationId !== context.orgId) {
            return [];
          }

          return [
            apiKeyResponseSchema.parse({
              id: key.id,
              name: key.name ?? null,
              prefix: key.prefix ?? null,
              start: key.start ?? null,
              scope: metadata.role ?? "member",
              organizationId: metadata.organizationId,
              expiresAt: key.expiresAt ?? null,
              lastUsedAt: key.lastRequest ?? null,
              createdAt: key.createdAt,
              updatedAt: key.updatedAt,
            }),
          ];
        })
        .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return { items };
    } catch (error) {
      throw parseBetterAuthError(error, "Failed to list API keys");
    }
  });

// Create an API key for the active organization
export const create = adminOnly
  .route({ method: "POST", path: "/api-keys", successStatus: 201 })
  .input(createApiKeySchema)
  .output(createApiKeyResponseSchema)
  .handler(async ({ input, context }) => {
    const actorRole = context.role;
    if (!actorRole) {
      throw new ApplicationError("Admin role is required", {
        code: "FORBIDDEN",
      });
    }

    if (roleRank(input.scope) > roleRank(actorRole)) {
      throw new ApplicationError(
        "API key scope cannot exceed your organization role",
        { code: "BAD_REQUEST" },
      );
    }

    let expiresIn: number | undefined;
    if (input.expiresAt) {
      expiresIn = Math.floor((input.expiresAt.getTime() - Date.now()) / 1000);
      if (expiresIn < 60 * 60 * 24) {
        throw new ApplicationError(
          "API key expiration must be at least 1 day in the future",
          {
            code: "BAD_REQUEST",
          },
        );
      }
    }

    try {
      const created = await auth.api.createApiKey({
        headers: context.headers,
        body: {
          name: input.name,
          expiresIn,
          metadata: {
            organizationId: context.orgId,
            role: input.scope,
          },
        },
      });

      return createApiKeyResponseSchema.parse({
        id: created.id,
        name: created.name ?? null,
        prefix: created.prefix ?? null,
        start: created.start ?? null,
        scope: input.scope,
        organizationId: context.orgId,
        expiresAt: created.expiresAt ?? null,
        lastUsedAt: created.lastRequest ?? null,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        key: created.key,
      });
    } catch (error) {
      throw parseBetterAuthError(error, "Failed to create API key");
    }
  });

// Revoke (delete) an API key
export const revoke = adminOnly
  .route({ method: "DELETE", path: "/api-keys/{id}" })
  .input(revokeApiKeySchema)
  .output(successResponseSchema)
  .handler(async ({ input, context }) => {
    try {
      const existing = await auth.api.getApiKey({
        headers: context.headers,
        query: { id: input.id },
      });

      const metadata = parseMetadata(existing.metadata);
      if (!metadata || metadata.organizationId !== context.orgId) {
        throw new ApplicationError("API key not found", { code: "NOT_FOUND" });
      }

      await auth.api.deleteApiKey({
        headers: context.headers,
        body: { keyId: input.id },
      });

      return { success: true as const };
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }

      throw parseBetterAuthError(error, "Failed to revoke API key");
    }
  });

export const apiKeyRoutes = {
  list,
  create,
  revoke,
};
