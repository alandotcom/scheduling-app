// @scheduling/api - Hono + oRPC API server with BetterAuth
// Dual transport: oRPC for UI (type-safe), OpenAPI for M2M (REST)

import {
  configure,
  getConsoleSink,
  getLogger,
  getAnsiColorFormatter,
} from "@logtape/logtape";

const isDev = process.env.NODE_ENV !== "production";

await configure({
  sinks: {
    console: getConsoleSink({
      formatter: getAnsiColorFormatter({ timestamp: "time" }),
    }),
  },
  loggers: [
    {
      category: ["logtape", "meta"],
      sinks: ["console"],
      lowestLevel: "warning",
    },
    { category: ["db"], sinks: ["console"], lowestLevel: "info" },
    { category: [], sinks: ["console"], lowestLevel: isDev ? "debug" : "info" },
  ],
});

const logger = getLogger(["api"]);

import { Hono } from "hono";
import { RPCHandler } from "@orpc/server/fetch";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { uiRouter, apiRouter } from "./routes/index.js";
import { openAPIGenerator } from "./lib/orpc.js";
import { auth } from "./lib/auth.js";
import { authMiddleware } from "./middleware/auth.js";
import { rlsMiddleware } from "./middleware/rls.js";
// import { rateLimitMiddleware } from "./middleware/rate-limit.js"; // Disabled for dev
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { config } from "./config.js";

const app = new Hono();

// Global error handler
app.use("*", errorHandler);
app.use("*", requestLogger);

// Health check (no auth required)
app.get("/v1/health", (c) => c.json({ status: "ok" }));
app.get("/api/v1/health", (c) => c.json({ status: "ok" }));

// BetterAuth routes
app.on(["GET", "POST"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// ============================================================================
// oRPC HANDLER (Admin UI) - /v1/*
// Type-safe RPC protocol for internal admin UI
// ============================================================================

// Auth and RLS middleware for oRPC routes
app.use("/v1/*", authMiddleware);
// app.use("/v1/*", rateLimitMiddleware); // Disabled for dev
app.use("/v1/*", rlsMiddleware);

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

// OpenAPI spec endpoint (no auth required)
app.get("/api/v1/openapi.json", async (c) => {
  const spec = await openAPIGenerator.generate(apiRouter, {
    info: {
      title: "Scheduling API",
      version: "1.0.0",
      description: "REST API for appointment scheduling integrations",
    },
    servers: [{ url: "/api/v1" }],
  });
  return c.json(spec);
});

// Auth and RLS middleware for OpenAPI routes
app.use("/api/v1/*", authMiddleware);
// app.use("/api/v1/*", rateLimitMiddleware); // Disabled for dev
app.use("/api/v1/*", rlsMiddleware);

// OpenAPI handler for M2M API
const openAPIHandler = new OpenAPIHandler(apiRouter);

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

void logger.info`Server running on port ${config.server.port}`;
