// Database client setup with RLS helpers

import { drizzle } from "drizzle-orm/bun-sql";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import * as schema from "@scheduling/db/schema";
import { relations } from "@scheduling/db/relations";
import { config } from "../config.js";
import { getContext } from "./request-context.js";

// Create Bun SQL client
const client = new SQL(config.db.url);

// Create drizzle instance with schema and relations for relational queries
export const db = drizzle({ client, schema, relations });

// Export types
export type Database = BunSQLDatabase<typeof schema, typeof relations>;
export type DbTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
export type DbClient = Database | DbTransaction;

// Helper to run queries with org context (RLS) - explicit orgId version
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

/**
 * Run queries with RLS context from AsyncLocalStorage.
 * Sets both org_id and user_id from the current request context.
 * Throws if no org context is available.
 */
export async function withRls<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
  const ctx = getContext();
  if (!ctx?.orgId) {
    throw new Error("No org context available for RLS");
  }

  return db.transaction(async (tx) => {
    // Set org context for RLS
    await tx.execute(
      sql`SELECT set_config('app.current_org_id', ${ctx.orgId}, true)`,
    );
    // Set user context if available (for user-level RLS policies)
    if (ctx.userId) {
      await tx.execute(
        sql`SELECT set_config('app.current_user_id', ${ctx.userId}, true)`,
      );
    }
    return fn(tx);
  });
}
