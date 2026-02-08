// Configuration loaded from environment variables with validation

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
      default: "http://localhost:5173",
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
      default: "http://localhost:5173",
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
});

export const authBaseUrl =
  config.auth.baseUrl ?? `http://localhost:${config.server.port}`;

export type Config = typeof config;
