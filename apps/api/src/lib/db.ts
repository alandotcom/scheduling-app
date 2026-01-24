// Database client setup with RLS helpers

import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import * as schema from "@scheduling/db/schema";
import { config } from "../config.js";

// Create Bun SQL client
const client = new SQL(config.db.url);

// Create drizzle instance with schema for relational queries
export const db = drizzle({ client, schema });

// Export types
export type Database = BunSQLDatabase<typeof schema>;
export type DbTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
export type DbClient = Database | DbTransaction;

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
