// Auth middleware - validates session or API token and populates context

import { createMiddleware } from "hono/factory";
import { auth } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { apiTokens } from "@scheduling/db/schema";
import { eq, sql } from "drizzle-orm";
import { createHash } from "crypto";
import type { AuthMethod } from "../lib/orpc.js";

declare module "hono" {
  interface ContextVariableMap {
    userId: string | null;
    orgId: string | null;
    sessionId: string | null;
    tokenId: string | null;
    authMethod: AuthMethod;
    role: "admin" | "staff" | null;
  }
}

// Hash a token using SHA-256
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const authMiddleware = createMiddleware(async (c, next) => {
  // Try session auth first
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (session?.user) {
    c.set("userId", session.user.id);
    c.set("sessionId", session.session.id);
    c.set("tokenId", null);
    c.set("authMethod", "session");

    // Set user context for RLS before querying org_memberships
    await db.execute(
      sql`SELECT set_config('app.current_user_id', ${session.user.id}, false)`,
    );

    try {
      // Get org context from header or query param
      const orgId = c.req.header("X-Org-Id") ?? c.req.query("org_id");

      if (orgId) {
        // Verify user is member of this org
        const membership = await db.query.orgMemberships.findFirst({
          where: {
            userId: session.user.id,
            orgId: orgId,
          },
        });

        if (membership) {
          c.set("orgId", orgId);
          c.set("role", membership.role as "admin" | "staff");
        } else {
          return c.json(
            {
              error: { code: "FORBIDDEN", message: "Not a member of this org" },
            },
            403,
          );
        }
      } else {
        // Default to first org membership
        const membership = await db.query.orgMemberships.findFirst({
          where: { userId: session.user.id },
        });
        if (membership) {
          c.set("orgId", membership.orgId);
          c.set("role", membership.role as "admin" | "staff");
        } else {
          c.set("orgId", null);
          c.set("role", null);
        }
      }
    } finally {
      // Clear user context - RLS middleware will set both user and org context properly
      await db.execute(
        sql`SELECT set_config('app.current_user_id', '', false)`,
      );
    }

    return next();
  }

  // Try API token auth
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const tokenHash = hashToken(token);

    // Find the token by hash
    const apiToken = await db.query.apiTokens.findFirst({
      where: {
        tokenHash: tokenHash,
        revokedAt: { isNull: true },
      },
    });

    if (apiToken) {
      // Check if token is expired
      if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
        return c.json(
          { error: { code: "UNAUTHORIZED", message: "API token has expired" } },
          401,
        );
      }

      // Update last used timestamp (non-blocking)
      db.update(apiTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiTokens.id, apiToken.id))
        .catch(() => {}); // Ignore errors for last_used_at update

      c.set("userId", apiToken.userId);
      c.set("orgId", apiToken.orgId);
      c.set("sessionId", null);
      c.set("tokenId", apiToken.id);
      c.set("authMethod", "token");
      c.set("role", apiToken.scope as "admin" | "staff");

      return next();
    }

    // Invalid token
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid API token" } },
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
