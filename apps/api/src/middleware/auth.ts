// Auth middleware - validates session or API key and populates context

import { createMiddleware } from "hono/factory";
import { auth } from "../lib/auth.js";
import { db } from "../lib/db.js";
import type { AuthMethod } from "../lib/orpc.js";
import { isRecord } from "../lib/type-guards.js";

type ApiKeyRole = "owner" | "admin" | "member";
type ApiKeyMetadata = {
  organizationId?: string;
  role?: ApiKeyRole;
};

function isApiKeyRole(value: unknown): value is ApiKeyRole {
  return value === "owner" || value === "admin" || value === "member";
}

function parseApiKeyMetadata(metadata: unknown): ApiKeyMetadata | null {
  if (!metadata) return null;

  let parsed: unknown = metadata;
  if (typeof metadata === "string") {
    try {
      parsed = JSON.parse(metadata);
    } catch {
      return null;
    }
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const result: ApiKeyMetadata = {};
  if (typeof parsed["organizationId"] === "string") {
    result.organizationId = parsed["organizationId"];
  }
  if (isApiKeyRole(parsed["role"])) {
    result.role = parsed["role"];
  }

  return result;
}

declare module "hono" {
  interface ContextVariableMap {
    userId: string | null;
    orgId: string | null;
    sessionId: string | null;
    tokenId: string | null;
    authMethod: AuthMethod;
    role: "owner" | "admin" | "member" | null;
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  // Try session auth first
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (session?.user) {
    c.set("userId", session.user.id);
    c.set("sessionId", session.session.id);
    c.set("tokenId", null);
    c.set("authMethod", "session");

    const activeOrgId = session.session.activeOrganizationId ?? null;
    if (activeOrgId) {
      const membership = await db.query.orgMemberships.findFirst({
        where: {
          userId: session.user.id,
          orgId: activeOrgId,
        },
      });
      if (membership) {
        c.set("orgId", membership.orgId);
        c.set("role", membership.role);
      } else {
        c.set("orgId", null);
        c.set("role", null);
      }
    } else {
      c.set("orgId", null);
      c.set("role", null);
    }

    return next();
  }

  // Try API key auth
  const authHeader = c.req.header("Authorization");
  const headerKey = c.req.header("x-api-key");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : (headerKey ?? null);

  if (token) {
    const verification = await auth.api.verifyApiKey({
      body: { key: token },
    });

    if (verification.valid && verification.key) {
      const metadata = parseApiKeyMetadata(verification.key.metadata);
      const orgId = metadata?.organizationId ?? null;
      const keyRole = metadata?.role ?? null;

      if (!orgId) {
        return c.json(
          {
            error: {
              code: "UNAUTHORIZED",
              message: "API key is missing organization metadata",
            },
          },
          401,
        );
      }

      const membership = await db.query.orgMemberships.findFirst({
        where: {
          userId: verification.key.userId,
          orgId,
        },
      });

      if (!membership) {
        return c.json(
          {
            error: {
              code: "UNAUTHORIZED",
              message: "API key user is not a member of this organization",
            },
          },
          401,
        );
      }

      const roleRank = {
        member: 1,
        admin: 2,
        owner: 3,
      } as const;
      const keyRoleRank = keyRole
        ? roleRank[keyRole]
        : roleRank[membership.role];
      const membershipRoleRank = roleRank[membership.role];
      const effectiveRole =
        keyRoleRank <= membershipRoleRank ? keyRole : membership.role;

      c.set("userId", verification.key.userId);
      c.set("orgId", orgId);
      c.set("sessionId", null);
      c.set("tokenId", verification.key.id);
      c.set("authMethod", "token");
      c.set("role", effectiveRole ?? membership.role);

      return next();
    }

    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid API key" } },
      401,
    );
  }

  // For endpoints that allow unauthenticated access
  c.set("userId", null);
  c.set("orgId", null);
  c.set("sessionId", null);
  c.set("tokenId", null);
  c.set("authMethod", null);
  c.set("role", null);

  return next();
});
