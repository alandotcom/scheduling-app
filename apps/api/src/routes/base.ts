// Base oRPC procedures shared across routes

import { ORPCError } from "@orpc/server";
import { base } from "../lib/orpc.js";
import type { Context } from "../lib/orpc.js";

// Authenticated procedure helper
// Validates that the request has a valid session or API token
export const authUser = base.use(async (opts) => {
  const context = opts.context as Context;
  if (!context.userId) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Authentication required",
    });
  }

  return opts.next({
    context: {
      userId: context.userId,
      orgId: context.orgId,
      sessionId: context.sessionId,
      tokenId: context.tokenId,
      authMethod: context.authMethod,
      role: context.role,
      headers: context.headers,
    },
  });
});

// Authenticated + active organization helper
export const authed = authUser.use(async (opts) => {
  const { orgId } = opts.context;
  if (!orgId) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Active organization required",
    });
  }

  return opts.next({
    context: {
      ...opts.context,
      orgId,
    },
  });
});

// Admin-only procedure helper
// Validates that the authenticated user has admin role
export const adminOnly = authed.use(async (opts) => {
  const { role } = opts.context;
  if (role !== "admin" && role !== "owner") {
    throw new ORPCError("FORBIDDEN", {
      message: "Admin access required",
    });
  }

  return opts.next({
    context: {
      ...opts.context,
      role,
    },
  });
});
