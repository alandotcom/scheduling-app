// oRPC router composition

import { base } from '../lib/orpc.js'
import { locationRoutes } from './locations.js'
import { calendarRoutes } from './calendars.js'
import { resourceRoutes } from './resources.js'
import { appointmentTypeRoutes } from './appointment-types.js'
import { availabilityRoutes } from './availability.js'
import { appointmentRoutes } from './appointments.js'
import { apiTokenRoutes } from './api-tokens.js'

// Re-export authed and adminOnly from base for backwards compatibility
export { authed, adminOnly } from './base.js'

// Health check procedure
export const health = base.handler(async () => {
  return { status: 'ok' as const }
})

// Main router
export const router = {
  health,
  locations: locationRoutes,
  calendars: calendarRoutes,
  resources: resourceRoutes,
  appointmentTypes: appointmentTypeRoutes,
  availability: availabilityRoutes,
  appointments: appointmentRoutes,
  apiTokens: apiTokenRoutes,
  // Future routes:
  // clients: clientRoutes,
}

// Export router type for the client
export type Router = typeof router
