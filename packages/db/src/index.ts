// @scheduling/db - Database package with Drizzle ORM

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index.js'

// Re-export schema for consumers
export * from './schema/index.js'

// Get database URL from environment
const databaseUrl = process.env['DATABASE_URL'] ?? 'postgres://scheduling:scheduling@localhost:5433/scheduling'

// Create postgres.js client for queries
const client = postgres(databaseUrl)

// Create drizzle instance with schema for relational queries
export const db = drizzle(client, { schema })

// Export types
export type Database = typeof db
