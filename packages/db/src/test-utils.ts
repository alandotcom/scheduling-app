// Test utilities using real Postgres via Bun SQL
//
// This uses the scheduling_test database for production-parity testing.
// RLS is enforced natively by Postgres.

import { drizzle } from "drizzle-orm/bun-sql";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import * as schema from "./schema/index.js";
import { relations } from "./relations.js";

// Use DATABASE_URL which is set by test-setup.ts to point to test database
const TEST_DATABASE_URL =
  process.env["DATABASE_URL"] ??
  "postgres://scheduling_app:scheduling@localhost:5433/scheduling_test";

let testClient: SQL | null = null;
let testDb: BunSQLDatabase<typeof schema, typeof relations> | null = null;

/**
 * Create a test database connection using Bun SQL
 */
export async function createTestDb(): Promise<
  BunSQLDatabase<typeof schema, typeof relations>
> {
  if (testDb) return testDb;

  testClient = new SQL(TEST_DATABASE_URL);
  testDb = drizzle({ client: testClient, schema, relations });

  return testDb;
}

/**
 * Reset the test database by truncating all tables
 * Use this in beforeEach to ensure test isolation
 */
export async function resetTestDb(): Promise<void> {
  if (!testClient) return;

  // Truncate all tables in reverse dependency order
  await testClient.unsafe(`
    TRUNCATE TABLE
      event_outbox,
      scheduling_limits,
      blocked_time,
      availability_overrides,
      availability_rules,
      appointments,
      clients,
      appointment_type_resources,
      resources,
      appointment_type_calendars,
      calendars,
      appointment_types,
      locations,
      accounts,
      sessions,
      verifications,
      org_memberships,
      api_tokens,
      users,
      orgs
    CASCADE;
  `);
}

/**
 * Close the test database connection
 * Use this in afterAll to clean up
 */
export async function closeTestDb(): Promise<void> {
  if (testClient) {
    testClient.close();
    testClient = null;
    testDb = null;
  }
}

/**
 * Get the current test database instance
 * Throws if createTestDb hasn't been called
 */
export function getTestDb(): BunSQLDatabase<typeof schema, typeof relations> {
  if (!testDb) {
    throw new Error(
      "Test database not initialized. Call createTestDb() first.",
    );
  }
  return testDb;
}

/**
 * Seed a test organization with a user
 * Useful for setting up basic test fixtures
 */
export async function seedTestOrg(
  db: BunSQLDatabase<typeof schema, typeof relations>,
) {
  const [org] = await db
    .insert(schema.orgs)
    .values({
      name: "Test Org",
    })
    .returning();

  const [user] = await db
    .insert(schema.users)
    .values({
      email: "test@example.com",
      name: "Test User",
      emailVerified: true,
    })
    .returning();

  await db.insert(schema.orgMemberships).values({
    orgId: org!.id,
    userId: user!.id,
    role: "admin",
  });

  return { org: org!, user: user! };
}

/**
 * Seed a second test organization for RLS isolation testing
 */
export async function seedSecondTestOrg(
  db: BunSQLDatabase<typeof schema, typeof relations>,
) {
  const [org] = await db
    .insert(schema.orgs)
    .values({
      name: "Second Test Org",
    })
    .returning();

  const [user] = await db
    .insert(schema.users)
    .values({
      email: "second@example.com",
      name: "Second User",
      emailVerified: true,
    })
    .returning();

  await db.insert(schema.orgMemberships).values({
    orgId: org!.id,
    userId: user!.id,
    role: "admin",
  });

  return { org: org!, user: user! };
}

/**
 * Set the org context for RLS queries in tests
 * All subsequent queries will be filtered to this org
 */
export async function setTestOrgContext(
  db: BunSQLDatabase<typeof schema, typeof relations>,
  orgId: string,
): Promise<void> {
  await db.execute(
    sql`SELECT set_config('app.current_org_id', ${orgId}, false)`,
  );
}

/**
 * Clear the org context (queries will return no rows due to RLS)
 */
export async function clearTestOrgContext(
  db: BunSQLDatabase<typeof schema, typeof relations>,
): Promise<void> {
  await db.execute(sql`SELECT set_config('app.current_org_id', '', false)`);
}

/**
 * Run a function with a specific org context set, then restore previous context
 */
export async function withTestOrgContext<T>(
  db: BunSQLDatabase<typeof schema, typeof relations>,
  orgId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await setTestOrgContext(db, orgId);
  try {
    return await fn();
  } finally {
    await clearTestOrgContext(db);
  }
}
