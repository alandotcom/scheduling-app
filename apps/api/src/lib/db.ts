// Database client setup with RLS helpers

import { drizzle } from "drizzle-orm/bun-sql";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { getLogger } from "@logtape/logtape";
import * as schema from "@scheduling/db/schema";
import { relations } from "@scheduling/db/relations";
import { config } from "../config.js";
import { getApiTestDbOverride } from "./test-db-runtime.js";

const logger = getLogger(["db"]);
const isDev = process.env.NODE_ENV !== "production";

const SQL_POOL_MAX_CONNECTIONS = isDev ? 10 : 5;
const SQL_POOL_IDLE_TIMEOUT_SECONDS = isDev ? 300 : 30;
const SQL_POOL_CONNECTION_TIMEOUT_SECONDS = 30;

type GlobalWithDbClient = typeof globalThis & {
  __schedulingApiDbClient?: SQL;
};

const globalWithDbClient = globalThis as GlobalWithDbClient;

// Reuse SQL client across hot reloads to prevent connection buildup in dev.
const client =
  globalWithDbClient.__schedulingApiDbClient ??
  new SQL(config.db.url, {
    max: SQL_POOL_MAX_CONNECTIONS,
    idleTimeout: SQL_POOL_IDLE_TIMEOUT_SECONDS,
    connectionTimeout: SQL_POOL_CONNECTION_TIMEOUT_SECONDS,
  });

if (isDev) {
  globalWithDbClient.__schedulingApiDbClient = client;
}

// Export types
export type Database = BunSQLDatabase<typeof schema, typeof relations>;
export type DbTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
export type DbClient = Database | DbTransaction;

function createDefaultDb(): Database {
  return drizzle({
    client,
    schema,
    relations,
    logger: isDev
      ? {
          logQuery: (query: string) => logger.debug`${query.slice(0, 300)}`,
        }
      : false,
  }) as Database;
}

const defaultDb = createDefaultDb();
const testDbOverride = getApiTestDbOverride() as Database | undefined;

// Bound once at module load so all imports in this runtime share one DB handle.
export const db: Database = testDbOverride ?? defaultDb;

// Helper to run queries with org context (RLS)
export async function withOrg<T>(
  orgId: string,
  fn: (tx: DbClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config with true makes it local to the current transaction
    await tx.execute(
      sql`SELECT set_config('app.current_org_id', ${orgId}, true)`,
    );
    return fn(tx);
  });
}
