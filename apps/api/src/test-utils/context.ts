// Test context utilities for route integration testing
//
// These helpers create mock contexts that can be passed to oRPC handlers,
// bypassing HTTP/auth middleware while still testing actual handler logic.

import type { Context, AuthMethod } from "../lib/orpc.js";

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
