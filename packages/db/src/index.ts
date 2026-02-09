// @scheduling/db - Database package with Drizzle ORM

import { drizzle } from "drizzle-orm/bun-sql";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import { SQL } from "bun";
import * as schema from "./schema/index.js";
import { relations } from "./relations.js";

// Re-export schema for consumers
export * from "./schema/index.js";

// Get database URL from environment
const databaseUrl =
  process.env["DATABASE_URL"] ??
  "postgres://scheduling:scheduling@localhost:5433/scheduling";

const SQL_POOL_MAX_CONNECTIONS = 5;
const SQL_POOL_IDLE_TIMEOUT_SECONDS = 30;
const SQL_POOL_CONNECTION_TIMEOUT_SECONDS = 30;

type GlobalWithDbClient = typeof globalThis & {
  __schedulingPackageDbClient?: SQL;
};

const globalWithDbClient = globalThis as GlobalWithDbClient;

// Reuse SQL client across module reloads to avoid leaking pools in dev.
const client =
  globalWithDbClient.__schedulingPackageDbClient ??
  new SQL(databaseUrl, {
    max: SQL_POOL_MAX_CONNECTIONS,
    idleTimeout: SQL_POOL_IDLE_TIMEOUT_SECONDS,
    connectionTimeout: SQL_POOL_CONNECTION_TIMEOUT_SECONDS,
  });

if (process.env["NODE_ENV"] !== "production") {
  globalWithDbClient.__schedulingPackageDbClient = client;
}

// Create drizzle instance with schema and relations for relational queries
export const db = drizzle({ client, schema, relations });

// Export types
export type Database = BunSQLDatabase<typeof schema, typeof relations>;
