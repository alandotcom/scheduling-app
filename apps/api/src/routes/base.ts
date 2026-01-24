// Base oRPC procedures shared across routes

import { base, ORPCError } from '../lib/orpc.js'
import type { Context } from '../lib/orpc.js'

// Authenticated procedure helper
// Validates that the request has a valid session and org context
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
      role: context.role,
    },
  })
})
