// oRPC instance setup with context type

import { os } from "@orpc/server";

// Authentication method used for the request
export type AuthMethod = "session" | "token" | null;

// Context type available in all handlers
export interface Context {
  userId: string | null;
  orgId: string | null;
  sessionId: string | null;
  tokenId: string | null; // API token ID if authenticated via token
  authMethod: AuthMethod;
  role: "admin" | "staff" | null;
}

// Create the base oRPC instance with context type
export const base = os.$context<Context>();
