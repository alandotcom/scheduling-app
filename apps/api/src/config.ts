// Configuration loaded from environment variables with validation

import { envParse } from "standardenv";
import { z } from "zod";

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
      default: "postgres://scheduling:scheduling@localhost:5433/scheduling",
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
  },
  valkey: {
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

export const authBaseUrl = config.auth.baseUrl ?? `http://localhost:${config.server.port}`;

export type Config = typeof config;
