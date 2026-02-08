// Auth middleware - validates session or API token and populates context

import { createMiddleware } from "hono/factory";
import { auth } from "../lib/auth.js";
import { db } from "../lib/db.js";
import type { AuthMethod } from "../lib/orpc.js";

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
      const metadata = verification.key.metadata as {
        organizationId?: string;
        role?: "owner" | "admin" | "member";
      } | null;
      const orgId = metadata?.organizationId ?? null;
      let role = metadata?.role ?? null;

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

      if (!role) {
        const membership = await db.query.orgMemberships.findFirst({
          where: {
            userId: verification.key.userId,
            orgId,
          },
        });
        role = membership?.role ?? null;
      }

      c.set("userId", verification.key.userId);
      c.set("orgId", orgId);
      c.set("sessionId", null);
      c.set("tokenId", verification.key.id);
      c.set("authMethod", "token");
      c.set("role", role);

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
