// oRPC router composition
// Separate routers for UI (oRPC) and M2M API (OpenAPI)

import { base } from "../lib/orpc.js";
import { z } from "zod";
import { orgRoutes } from "./orgs.js";
import { locationRoutes } from "./locations.js";
import { calendarRoutes } from "./calendars.js";
import { resourceRoutes } from "./resources.js";
import { appointmentTypeRoutes } from "./appointment-types.js";
import { availabilityEngineRoutes } from "./availability.js";
import { availabilityRoutes } from "./availability.js";
import { appointmentRoutes } from "./appointments.js";
import { clientRoutes } from "./clients.js";
import { auditRoutes } from "./audit.js";
import { dashboardRoutes } from "./dashboard.js";
import { apiKeyRoutes } from "./api-keys.js";
import { webhookRoutes } from "./webhooks.js";
import { integrationRoutes } from "./integrations.js";
import { authRoutes } from "./auth.js";
import { journeyRoutes } from "./journeys.js";

// Re-export authed and adminOnly from base for backwards compatibility
export { authed, adminOnly } from "./base.js";

// Health check procedure
export const health = base
  .route({ method: "GET", path: "/health" })
  .output(z.object({ status: z.literal("ok") }))
  .handler(async () => {
    return { status: "ok" as const };
  });

// ============================================================================
// UI ROUTER (oRPC) - All routes including internal admin routes
// Used by admin UI via type-safe oRPC client at /v1/*
// ============================================================================
export const uiRouter = {
  health,
  auth: authRoutes,
  dashboard: dashboardRoutes,
  org: orgRoutes,
  locations: locationRoutes,
  calendars: calendarRoutes,
  resources: resourceRoutes,
  appointmentTypes: appointmentTypeRoutes,
  availability: availabilityRoutes,
  appointments: appointmentRoutes,
  clients: clientRoutes,
  audit: auditRoutes,
  apiKeys: apiKeyRoutes,
  integrations: integrationRoutes,
  webhooks: webhookRoutes,
  journeys: journeyRoutes,
};

// ============================================================================
// API ROUTER (OpenAPI) - Public routes for M2M integrations
// Excludes internal routes: audit, apiKeys, dashboard
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
  webhooks: webhookRoutes,
};

// Legacy export for backwards compatibility (points to UI router)
export const router = uiRouter;

// Export router types
export type UIRouter = typeof uiRouter;
export type APIRouter = typeof apiRouter;
export type Router = UIRouter;
