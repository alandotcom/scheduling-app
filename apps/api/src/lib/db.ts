// Database client setup with RLS helpers

import { drizzle, type BunSQLDatabase } from 'drizzle-orm/bun-sql'
import { SQL } from 'bun'
import { sql } from 'drizzle-orm'
import * as schema from '@scheduling/db/schema'
import { config } from '../config.js'

// Create Bun SQL client
const client = new SQL(config.db.url)

// Create drizzle instance with schema for relational queries
export const db = drizzle({ client, schema })

// Export types
export type Database = BunSQLDatabase<typeof schema>

// Helper to run queries with org context (RLS)
export async function withOrg<T>(
  orgId: string,
  fn: (tx: Database) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config with true makes it local to the current transaction
    await tx.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`)
    // Cast is safe here - transaction context has same query API
    return fn(tx as unknown as Database)
  })
}
