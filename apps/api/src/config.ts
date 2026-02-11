// Configuration loaded from environment variables with validation

import { envParse } from "standardenv";
import { z } from "zod";

const isDev = Bun.env.NODE_ENV !== "production";

const logLevelSchema = z.enum([
  "trace",
  "debug",
  "info",
  "warning",
  "error",
  "fatal",
]);

export const config = envParse(Bun.env, {
  server: {
    port: {
      format: z.coerce.number(),
      env: "PORT",
      default: 3000,
    },
  },
  logging: {
    level: {
      format: logLevelSchema,
      env: "LOG_LEVEL",
      default: isDev ? "debug" : "info",
    },
    dbLogLevel: {
      format: logLevelSchema,
      env: "DB_LOG_LEVEL",
      default: "info",
    },
  },
  db: {
    url: {
      format: z.url(),
      env: "DATABASE_URL",
      default: "postgres://scheduling_app:scheduling@localhost:5433/scheduling",
    },
  },
  auth: {
    secret: {
      format: z.string().min(1),
      env: "AUTH_SECRET",
      default: "dev-secret-change-in-production",
    },
    baseUrl: {
      format: z.url(),
      env: "AUTH_BASE_URL",
      optional: true,
    },
    trustedOrigins: {
      format: z.string(),
      env: "TRUSTED_ORIGINS",
      default: "http://localhost:5173,http://localhost:4173",
    },
    requireEmailVerification: {
      format: z.string().transform((v) => v === "true"),
      env: "REQUIRE_EMAIL_VERIFICATION",
      default: false,
    },
  },
  cors: {
    origin: {
      format: z.string(),
      env: "CORS_ORIGIN",
      default: "http://localhost:5173,http://localhost:4173",
    },
  },
  webhooks: {
    enabled: {
      format: z.string().transform((v) => v === "true"),
      env: "SVIX_WEBHOOKS_ENABLED",
      default: false,
    },
    baseUrl: {
      format: z.url(),
      env: "SVIX_BASE_URL",
      optional: true,
    },
    authToken: {
      format: z.string().min(1),
      env: "SVIX_AUTH_TOKEN",
      optional: true,
    },
  },
  integrations: {
    enabled: {
      format: z.string(),
      env: "INTEGRATIONS_ENABLED",
      default: "svix",
    },
    encryptionKey: {
      format: z.string().min(1),
      env: "INTEGRATIONS_ENCRYPTION_KEY",
      optional: true,
    },
  },
  inngest: {
    baseUrl: {
      format: z.url(),
      env: "INNGEST_BASE_URL",
      ...(isDev ? { default: "http://127.0.0.1:8288" } : { optional: true }),
    },
    eventKey: {
      format: z.string().min(1),
      env: "INNGEST_EVENT_KEY",
      ...(isDev ? { default: "dev" } : { optional: true }),
    },
    signingKey: {
      format: z.string().min(1),
      env: "INNGEST_SIGNING_KEY",
      optional: true,
    },
    servePath: {
      format: z.string(),
      env: "INNGEST_SERVE_PATH",
      default: "/api/inngest",
    },
    serveHost: {
      format: z.url(),
      env: "INNGEST_SERVE_HOST",
      optional: true,
    },
  },
});

export const authBaseUrl =
  config.auth.baseUrl ?? `http://localhost:${config.server.port}`;

export type Config = typeof config;
