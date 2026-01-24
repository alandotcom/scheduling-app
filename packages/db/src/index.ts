// @scheduling/db - Database package with Drizzle ORM

import { drizzle, type BunSQLDatabase } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import * as schema from "./schema/index.js";

// Re-export schema for consumers
export * from "./schema/index.js";

// Get database URL from environment
const databaseUrl =
  process.env["DATABASE_URL"] ??
  "postgres://scheduling:scheduling@localhost:5433/scheduling";

// Create Bun SQL client for queries
const client = new SQL(databaseUrl);

// Create drizzle instance with schema for relational queries
export const db = drizzle({ client, schema });

// Export types
export type Database = BunSQLDatabase<typeof schema>;
