// Request context using AsyncLocalStorage for ambient context access
// This eliminates prop-drilling of orgId/userId through service layers

import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  userId: string | null;
  orgId: string | null;
  sessionId: string | null;
  tokenId: string | null;
  authMethod: "session" | "token" | null;
  role: "admin" | "staff" | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function with the given request context.
 * All code within fn() can access context via getContext().
 */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * Get the current request context, if any.
 * Returns undefined if called outside of runWithContext().
 */
export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Get orgId from current context.
 * Throws if no org context is set.
 */
export function requireOrgId(): string {
  const ctx = storage.getStore();
  if (!ctx?.orgId) {
    throw new Error("No org context available");
  }
  return ctx.orgId;
}

/**
 * Get userId from current context.
 * Throws if no user context is set.
 */
export function requireUserId(): string {
  const ctx = storage.getStore();
  if (!ctx?.userId) {
    throw new Error("No user context available");
  }
  return ctx.userId;
}

/**
 * Get role from current context.
 * Returns null if no role is set.
 */
export function getRole(): "admin" | "staff" | null {
  const ctx = storage.getStore();
  return ctx?.role ?? null;
}
