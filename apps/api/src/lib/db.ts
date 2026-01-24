// Database client setup with RLS helpers

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
import * as schema from '@scheduling/db/schema'
import { config } from '../config.js'

// Create postgres.js client
const client = postgres(config.db.url)

// Create drizzle instance with schema for relational queries
export const db = drizzle(client, { schema })

// Export types
export type Database = typeof db

// Helper to run queries with org context (RLS)
export async function withOrg<T>(
  orgId: string,
  fn: (tx: Database) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    // SET LOCAL only affects the current transaction
    await tx.execute(sql`SET LOCAL app.current_org_id = ${orgId}`)
    // Cast is safe here - transaction context has same query API
    return fn(tx as unknown as Database)
  })
}
