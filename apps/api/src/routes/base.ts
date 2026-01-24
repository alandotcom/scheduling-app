// Base oRPC procedures shared across routes

import { base, ORPCError } from '../lib/orpc.js'
import type { Context, AuthMethod } from '../lib/orpc.js'

// Authenticated procedure helper
// Validates that the request has a valid session or API token and org context
export const authed = base.use(async (opts) => {
  const context = opts.context as Context
  if (!context.userId || !context.orgId) {
    throw new ORPCError('UNAUTHORIZED', {
      message: 'Authentication required',
    })
  }
  // Narrow the context types for downstream handlers
  return opts.next({
    context: {
      userId: context.userId,
      orgId: context.orgId,
      sessionId: context.sessionId,
      tokenId: context.tokenId,
      authMethod: context.authMethod as AuthMethod,
      role: context.role,
    },
  })
})

// Admin-only procedure helper
// Validates that the authenticated user has admin role
export const adminOnly = authed.use(async (opts) => {
  if (opts.context.role !== 'admin') {
    throw new ORPCError('FORBIDDEN', {
      message: 'Admin access required',
    })
  }
  return opts.next()
})
