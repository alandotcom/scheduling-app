// @scheduling/api - Hono + oRPC API server with BetterAuth
// Dual transport: oRPC for UI (type-safe), OpenAPI for M2M (REST)

import "./logger.js";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["api"]);

import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { cors } from "hono/cors";
import { RPCHandler } from "@orpc/server/fetch";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { uiRouter, apiRouter } from "./routes/index.js";
import { auth } from "./lib/auth.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { config } from "./config.js";
import { backfillAppIntegrationDefaultsForAllOrgs } from "./services/integrations/defaults.js";
import { bootstrapSvixEventCatalogOnStartup } from "./services/svix-event-catalog.js";
import { inngestServeHandler } from "./inngest/serve.js";
import { integrationOAuthRouter } from "./routes/integration-oauth.js";
import { twilioStatusCallbackRouter } from "./routes/integrations/twilio-status-callback.js";

const app = new Hono();

try {
  await bootstrapSvixEventCatalogOnStartup();
} catch (error) {
  logger.warn(
    "Failed to sync Svix webhook event catalog on startup — is the Svix server running? {error}",
    { error },
  );
}

try {
  await backfillAppIntegrationDefaultsForAllOrgs();
} catch (error) {
  logger.warn(
    "Failed to backfill app integration defaults on startup — is the database reachable? {error}",
    { error },
  );
}

// Global middleware
app.use("*", errorHandler);
app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: config.cors.origin.split(",").map((o) => o.trim()),
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-api-key"],
    maxAge: 86400,
  }),
);
app.use("*", requestLogger);

// Health check (no auth required)
app.get("/v1/health", (c) => c.json({ status: "ok" }));
app.get("/api/v1/health", (c) => c.json({ status: "ok" }));

// BetterAuth routes
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// Org-level OAuth integration routes (Slack, etc)
app.route("/api/integrations/oauth", integrationOAuthRouter);
app.route("/api/integrations/twilio", twilioStatusCallbackRouter);

// Inngest serve endpoint
app.on(["GET", "POST", "PUT"], config.inngest.servePath, inngestServeHandler);

// ============================================================================
// oRPC HANDLER (Admin UI) - /v1/*
// Type-safe RPC protocol for internal admin UI
// ============================================================================

// Auth middleware for oRPC routes
app.use("/v1/*", authMiddleware);

// oRPC handler for UI
const rpcHandler = new RPCHandler(uiRouter);

app.all("/v1/*", async (c) => {
  const { matched, response } = await rpcHandler.handle(c.req.raw, {
    prefix: "/v1",
    context: {
      userId: c.get("userId"),
      orgId: c.get("orgId"),
      sessionId: c.get("sessionId"),
      tokenId: c.get("tokenId"),
      authMethod: c.get("authMethod"),
      role: c.get("role"),
      headers: c.req.raw.headers,
    },
  });

  if (matched) {
    return c.newResponse(response.body, response);
  }

  return c.json(
    { error: { code: "NOT_FOUND", message: "Route not found" } },
    404,
  );
});

// ============================================================================
// OPENAPI HANDLER (M2M API) - /api/v1/*
// REST/OpenAPI protocol for external M2M integrations
// ============================================================================

const openAPIHandler = new OpenAPIHandler(apiRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
      docsProvider: "scalar",
      docsTitle: "Scheduling API",
      docsPath: "/docs",
      specPath: "/openapi.json",
      specGenerateOptions: {
        info: {
          title: "Scheduling API",
          version: "1.0.0",
          description: "REST API for appointment scheduling integrations",
        },
        servers: [{ url: "/api/v1" }],
        components: {
          securitySchemes: {
            BearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "API Key",
              description: "Use your Better Auth API key as a Bearer token",
            },
            ApiKeyAuth: {
              type: "apiKey",
              in: "header",
              name: "x-api-key",
              description:
                "Use your Better Auth API key in the x-api-key header",
            },
          },
        },
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
      },
    }),
  ],
});

// Auth middleware for OpenAPI routes
app.use("/api/v1/*", authMiddleware);

app.all("/api/v1/*", async (c) => {
  const { matched, response } = await openAPIHandler.handle(c.req.raw, {
    prefix: "/api/v1",
    context: {
      userId: c.get("userId"),
      orgId: c.get("orgId"),
      sessionId: c.get("sessionId"),
      tokenId: c.get("tokenId"),
      authMethod: c.get("authMethod"),
      role: c.get("role"),
      headers: c.req.raw.headers,
    },
  });

  if (matched) {
    return c.newResponse(response.body, response);
  }

  return c.json(
    { error: { code: "NOT_FOUND", message: "Route not found" } },
    404,
  );
});

// Export for Bun server
export default {
  port: config.server.port,
  fetch: app.fetch,
};

logger.info(`Server running on port ${config.server.port}`);
