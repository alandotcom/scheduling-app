// oRPC instance setup with context type

import { os, ORPCError } from '@orpc/server'

// Context type available in all handlers
export interface Context {
  userId: string | null
  orgId: string | null
  sessionId: string | null
  role: 'admin' | 'staff' | null
}

// Create the base oRPC instance with context type
export const base = os.$context<Context>()

// Re-export ORPCError for use in routes
export { ORPCError }
