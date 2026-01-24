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

// Create Bun SQL client for queries
const client = new SQL(databaseUrl);

// Create drizzle instance with schema and relations for relational queries
export const db = drizzle({ client, schema, relations });

// Export types
export type Database = BunSQLDatabase<typeof schema, typeof relations>;
