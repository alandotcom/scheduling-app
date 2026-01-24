// oRPC router composition
// Routes will be added in subsequent steps

import { base, ORPCError } from '../lib/orpc.js'
import type { Context } from '../lib/orpc.js'

// Authenticated procedure helper
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

// Health check procedure
export const health = base.handler(async () => {
  return { status: 'ok' as const }
})

// Main router - routes will be added in subsequent steps
export const router = {
  health,
  // Future routes:
  // locations: locationRoutes,
  // calendars: calendarRoutes,
  // appointmentTypes: appointmentTypeRoutes,
  // resources: resourceRoutes,
  // appointments: appointmentRoutes,
  // availability: availabilityRoutes,
  // clients: clientRoutes,
}

// Export router type for the client
export type Router = typeof router
