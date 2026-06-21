// Database client setup with RLS helpers

import { drizzle } from "drizzle-orm/bun-sql";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { getLogger } from "@logtape/logtape";
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
export type Database = BunSQLDatabase<typeof relations>;
export type DbTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
export type DbClient = Database | DbTransaction;

// A transaction with org context already established by withOrg. Repositories
// that touch RLS tables require this brand, so calling one without org context
// is a compile error. The brand is phantom — it exists only at the type level.
declare const orgScopedBrand: unique symbol;
export type OrgScopedTx = DbClient & { readonly [orgScopedBrand]: true };

function createDefaultDb(): Database {
  return drizzle({
    client,
    relations,
    logger: isDev
      ? {
          logQuery: (query: string) => logger.debug`${query.slice(0, 300)}`,
        }
      : false,
  }) as Database;
}

function isDatabaseOverride(value: object | undefined): value is Database {
  return (
    value !== undefined &&
    "transaction" in value &&
    "select" in value &&
    "execute" in value
  );
}

const defaultDb = createDefaultDb();
const testDbOverride = getApiTestDbOverride();

// Bound once at module load so all imports in this runtime share one DB handle.
export const db: Database = isDatabaseOverride(testDbOverride)
  ? testDbOverride
  : defaultDb;

// Helper to run queries with org context (RLS). Sets the org context once and
// yields a branded OrgScopedTx that repositories require.
export async function withOrg<T>(
  orgId: string,
  fn: (tx: OrgScopedTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config with true makes it local to the current transaction
    await tx.execute(
      sql`SELECT set_config('app.current_org_id', ${orgId}, true)`,
    );
    // The sole sanctioned brand mint: org context is now set on this tx, so it
    // satisfies the OrgScopedTx contract. The phantom brand is unreachable to
    // the type system, so this assertion is unavoidable and intentionally local.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return fn(tx as OrgScopedTx);
  });
}
