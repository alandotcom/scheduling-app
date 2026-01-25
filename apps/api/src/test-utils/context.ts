// Test context utilities for route integration testing
//
// These helpers create mock contexts that can be passed to oRPC handlers,
// bypassing HTTP/auth middleware while still testing actual handler logic.

import type { Context, AuthMethod } from "../lib/orpc.js";
import { call as orpcCall } from "@orpc/server";
import { runWithContext, type RequestContext } from "../lib/request-context.js";

/**
 * Options for creating a test context
 */
export interface TestContextOptions {
  orgId: string;
  userId: string;
  role?: "admin" | "staff";
  sessionId?: string;
  tokenId?: string;
  authMethod?: AuthMethod;
}

/**
 * Create a test context for use with oRPC handlers.
 *
 * This creates a mock context object that mimics what the auth middleware
 * would produce, allowing direct handler testing without HTTP overhead.
 *
 * @example
 * ```ts
 * const ctx = createTestContext({ orgId: org.id, userId: user.id, role: 'admin' })
 * const result = await locationRoutes.list.handler({ input: { limit: 10 }, context: ctx })
 * ```
 */
export function createTestContext(options: TestContextOptions): Context {
  return {
    orgId: options.orgId,
    userId: options.userId,
    role: options.role ?? "admin",
    sessionId: options.sessionId ?? "test-session-id",
    tokenId: options.tokenId ?? null,
    authMethod: options.authMethod ?? "session",
  };
}

/**
 * Create an unauthenticated context (for testing public endpoints)
 */
export function createUnauthenticatedContext(): Context {
  return {
    orgId: null,
    userId: null,
    role: null,
    sessionId: null,
    tokenId: null,
    authMethod: null,
  };
}

/**
 * Create a context authenticated via API token
 */
export function createTokenContext(
  options: Omit<TestContextOptions, "authMethod" | "sessionId">,
): Context {
  return {
    orgId: options.orgId,
    userId: options.userId,
    role: options.role ?? "admin",
    sessionId: null,
    tokenId: options.tokenId ?? "test-token-id",
    authMethod: "token",
  };
}

/**
 * Convert oRPC Context to RequestContext for AsyncLocalStorage
 */
function toRequestContext(ctx: Context): RequestContext {
  return {
    orgId: ctx.orgId,
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    tokenId: ctx.tokenId,
    authMethod: ctx.authMethod,
    role: ctx.role,
  };
}

/**
 * Run a function with AsyncLocalStorage context set up.
 * Use this to wrap test code that needs org/user context.
 *
 * @example
 * ```ts
 * const ctx = createTestContext({ orgId: org.id, userId: user.id })
 * const result = await withTestContext(ctx, () => someService.doSomething())
 * ```
 */
export function withTestContext<T>(ctx: Context, fn: () => T): T {
  const requestContext = toRequestContext(ctx);
  return runWithContext(requestContext, fn);
}

/**
 * Wrapped oRPC call that sets up AsyncLocalStorage context.
 *
 * This is a typed wrapper around oRPC's call that ensures the
 * AsyncLocalStorage context is set for services using requireOrgId/etc.
 *
 * Uses the same signature as oRPC's call function to preserve type inference.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const call: typeof orpcCall = ((
  procedure: any,
  input: any,
  ...rest: any[]
) => {
  // Extract context from options (rest[0] if provided)
  const options = rest[0] as { context?: Context } | undefined;
  const ctx = options?.context;

  if (ctx) {
    const requestContext = toRequestContext(ctx);
    return runWithContext(requestContext, () =>
      orpcCall(procedure, input, ...rest),
    );
  }

  // No context provided, call directly
  return orpcCall(procedure, input, ...rest);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;
