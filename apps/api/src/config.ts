// Configuration loaded from environment variables with validation

import process from "node:process";
import { URL } from "node:url";
import { envParse } from "standardenv";
import { z } from "zod";

const redisUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "redis:" || protocol === "rediss:";
  }, "REDIS_URL must use redis:// or rediss://");

export const config = envParse(process.env, {
  server: {
    port: {
      format: z.coerce.number(),
      env: "PORT",
      default: 3000,
    },
  },
  bullBoard: {
    host: {
      format: z.string(),
      env: "BULL_BOARD_HOST",
      default: "127.0.0.1",
    },
    port: {
      format: z.coerce.number(),
      env: "BULL_BOARD_PORT",
      default: 3010,
    },
    basePath: {
      format: z.string(),
      env: "BULL_BOARD_BASE_PATH",
      default: "/",
    },
  },
  db: {
    url: {
      format: z.string().url(),
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
      format: z.string().url(),
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
  valkey: {
    url: {
      format: redisUrlSchema,
      env: "REDIS_URL",
      optional: true,
    },
    host: {
      format: z.string(),
      env: "VALKEY_HOST",
      default: "localhost",
    },
    port: {
      format: z.coerce.number(),
      env: "VALKEY_PORT",
      default: 6380,
    },
  },
  webhooks: {
    enabled: {
      format: z.string().transform((v) => v === "true"),
      env: "SVIX_WEBHOOKS_ENABLED",
      default: false,
    },
    baseUrl: {
      format: z.string().url(),
      env: "SVIX_BASE_URL",
      optional: true,
    },
    authToken: {
      format: z.string().min(1),
      env: "SVIX_AUTH_TOKEN",
      optional: true,
    },
  },
});

export const authBaseUrl =
  config.auth.baseUrl ?? `http://localhost:${config.server.port}`;

export type Config = typeof config;
