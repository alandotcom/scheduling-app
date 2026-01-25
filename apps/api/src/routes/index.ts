// oRPC router composition
// Separate routers for UI (oRPC) and M2M API (OpenAPI)

import { base } from "../lib/orpc.js";
import { locationRoutes } from "./locations.js";
import { calendarRoutes } from "./calendars.js";
import { resourceRoutes } from "./resources.js";
import { appointmentTypeRoutes } from "./appointment-types.js";
import { availabilityEngineRoutes } from "./availability.js";
import { availabilityRoutes } from "./availability.js";
import { appointmentRoutes } from "./appointments.js";
import { clientRoutes } from "./clients.js";
import { apiTokenRoutes } from "./api-tokens.js";
import { auditRoutes } from "./audit.js";

// Re-export authed and adminOnly from base for backwards compatibility
export { authed, adminOnly } from "./base.js";

// Health check procedure
export const health = base
  .route({ method: "GET", path: "/health" })
  .handler(async () => {
    return { status: "ok" as const };
  });

// ============================================================================
// UI ROUTER (oRPC) - All routes including internal admin routes
// Used by admin UI via type-safe oRPC client at /v1/*
// ============================================================================
export const uiRouter = {
  health,
  locations: locationRoutes,
  calendars: calendarRoutes,
  resources: resourceRoutes,
  appointmentTypes: appointmentTypeRoutes,
  availability: availabilityRoutes,
  appointments: appointmentRoutes,
  clients: clientRoutes,
  apiTokens: apiTokenRoutes,
  audit: auditRoutes,
};

// ============================================================================
// API ROUTER (OpenAPI) - Public routes for M2M integrations
// Excludes internal routes: apiTokens, audit
// Used by external clients via REST at /api/v1/*
// ============================================================================
export const apiRouter = {
  health,
  locations: locationRoutes,
  calendars: calendarRoutes,
  resources: resourceRoutes,
  appointmentTypes: appointmentTypeRoutes,
  availability: availabilityEngineRoutes,
  appointments: appointmentRoutes,
  clients: clientRoutes,
};

// Legacy export for backwards compatibility (points to UI router)
export const router = uiRouter;

// Export router types
export type UIRouter = typeof uiRouter;
export type APIRouter = typeof apiRouter;
export type Router = UIRouter;
