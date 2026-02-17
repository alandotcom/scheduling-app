// Test utilities using in-memory PgLite.
//
// Each createTestDb call returns an isolated database instance so test files can
// run concurrently without sharing state.

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import { drizzle } from "drizzle-orm/pglite";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import * as schema from "./schema/index.js";
import { relations } from "./relations.js";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");
const MIGRATION_BREAKPOINT = "--> statement-breakpoint";
const TEST_ROLE = "scheduling_app";
const CURRENT_TEST_DB_KEY = "__schedulingCurrentTestDb";

const TRUNCATE_ALL_TABLES_SQL = `
  TRUNCATE TABLE
    journey_deliveries,
    journey_runs,
    journey_versions,
    journeys,
    workflow_execution_logs,
    workflow_execution_events,
    workflow_wait_states,
    workflow_executions,
    workflows,
    audit_events,
    integrations,
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
    org_invitations,
    org_memberships,
    apikey,
    users,
    orgs
  CASCADE;
`;

export type TestDatabase = BunSQLDatabase<typeof schema, typeof relations>;
type TestDbExecutor = Pick<TestDatabase, "execute">;

const clientsByDb = new WeakMap<TestDatabase, PGlite>();

type GlobalWithCurrentTestDb = typeof globalThis & {
  [CURRENT_TEST_DB_KEY]?: TestDatabase;
};

const globalWithCurrentTestDb = globalThis as GlobalWithCurrentTestDb;

export function setCurrentTestDb(db: TestDatabase | null): void {
  if (db === null) {
    delete globalWithCurrentTestDb[CURRENT_TEST_DB_KEY];
    return;
  }

  globalWithCurrentTestDb[CURRENT_TEST_DB_KEY] = db;
}

export function getTestDb(): TestDatabase {
  const currentDb = globalWithCurrentTestDb[CURRENT_TEST_DB_KEY];
  if (!currentDb) {
    throw new Error(
      "Test database not initialized. Ensure test-db preload runs before tests.",
    );
  }
  return currentDb;
}

const SKIPPED_STATEMENT_PATTERNS = [
  /^CREATE EXTENSION IF NOT EXISTS btree_gist;$/gim,
  /^CREATE EXTENSION IF NOT EXISTS citext;$/gim,
  /^CREATE INDEX "appointments_calendar_range_gist_idx".*$/gim,
  /^CREATE INDEX "blocked_time_calendar_range_gist_idx".*$/gim,
];

const CLIENTS_EMAIL_UNIQUE_INDEX =
  'CREATE UNIQUE INDEX "clients_org_email_unique_idx" ON "clients" ("org_id","email") WHERE "email" IS NOT NULL;';

const CLIENTS_EMAIL_UNIQUE_INDEX_PGLITE =
  'CREATE UNIQUE INDEX "clients_org_email_unique_idx" ON "clients" ("org_id",lower("email")) WHERE "email" IS NOT NULL;';

function patchMigrationSql(input: string): string {
  let patched = input;

  for (const pattern of SKIPPED_STATEMENT_PATTERNS) {
    patched = patched.replace(pattern, "");
  }

  patched = patched.replace(/\bcitext\b/g, "text");
  patched = patched.replace(
    CLIENTS_EMAIL_UNIQUE_INDEX,
    CLIENTS_EMAIL_UNIQUE_INDEX_PGLITE,
  );

  return patched;
}

async function runMigrations(db: TestDbExecutor): Promise<void> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const migrationDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const dirName of migrationDirs) {
    const migrationPath = join(MIGRATIONS_DIR, dirName, "migration.sql");
    const migrationSql = await readFile(migrationPath, "utf8");
    const patchedMigrationSql = patchMigrationSql(migrationSql);

    const statements = patchedMigrationSql
      .split(MIGRATION_BREAKPOINT)
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    for (const statement of statements) {
      await db.execute(sql.raw(statement));
    }
  }
}

async function ensureTestCompatibility(db: TestDbExecutor): Promise<void> {
  await db.execute(
    sql.raw(`CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid AS $$
      SELECT gen_random_uuid()
    $$ LANGUAGE SQL`),
  );
}

async function configureTestRole(db: TestDbExecutor): Promise<void> {
  await db.execute(sql.raw(`CREATE ROLE ${TEST_ROLE} LOGIN`));
  await db.execute(sql.raw(`GRANT ALL ON SCHEMA public TO ${TEST_ROLE}`));
  await db.execute(
    sql.raw(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${TEST_ROLE}`),
  );
  await db.execute(
    sql.raw(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ${TEST_ROLE}`),
  );
  await db.execute(
    sql.raw(`GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO ${TEST_ROLE}`),
  );
  await db.execute(sql.raw(`SET ROLE ${TEST_ROLE}`));
}

/**
 * Create an isolated test database instance.
 */
export async function createTestDb(): Promise<TestDatabase> {
  const existingDb = globalWithCurrentTestDb[CURRENT_TEST_DB_KEY];
  if (existingDb) {
    return existingDb;
  }

  const client = new PGlite();
  const db = drizzle({ client, schema, relations });

  await ensureTestCompatibility(db);
  await runMigrations(db);
  await configureTestRole(db);

  const testDb = db as unknown as TestDatabase;
  clientsByDb.set(testDb, client);
  globalWithCurrentTestDb[CURRENT_TEST_DB_KEY] = testDb;
  return testDb;
}

/**
 * Reset the test database by truncating all tables.
 * Use this in beforeEach to ensure test isolation.
 */
export async function resetTestDb(db: TestDatabase): Promise<void> {
  await clearTestContext(db);
  await db.execute(sql.raw(TRUNCATE_ALL_TABLES_SQL));
}

/**
 * Close the test database connection for this instance.
 */
export async function closeTestDb(db: TestDatabase): Promise<void> {
  const client = clientsByDb.get(db);
  if (!client) return;

  await client.close();
  clientsByDb.delete(db);

  if (globalWithCurrentTestDb[CURRENT_TEST_DB_KEY] === db) {
    delete globalWithCurrentTestDb[CURRENT_TEST_DB_KEY];
  }
}

/**
 * Seed a test organization with a user.
 * Useful for setting up basic test fixtures.
 */
export async function seedTestOrg(db: TestDatabase) {
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

  // Set user context for RLS before inserting org_membership.
  await db.execute(
    sql`SELECT set_config('app.current_user_id', ${user!.id}, false)`,
  );

  await db.insert(schema.orgMemberships).values({
    orgId: org!.id,
    userId: user!.id,
    role: "owner",
  });

  // Clear user context after seeding.
  await db.execute(sql`SELECT set_config('app.current_user_id', '', false)`);

  return { org: org!, user: user! };
}

/**
 * Seed a second test organization for RLS isolation testing.
 */
export async function seedSecondTestOrg(db: TestDatabase) {
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

  // Set user context for RLS before inserting org_membership.
  await db.execute(
    sql`SELECT set_config('app.current_user_id', ${user!.id}, false)`,
  );

  await db.insert(schema.orgMemberships).values({
    orgId: org!.id,
    userId: user!.id,
    role: "owner",
  });

  // Clear user context after seeding.
  await db.execute(sql`SELECT set_config('app.current_user_id', '', false)`);

  return { org: org!, user: user! };
}

/**
 * Set the org context for RLS queries in tests.
 * All subsequent queries will be filtered to this org.
 */
export async function setTestOrgContext(
  db: TestDatabase,
  orgId: string,
): Promise<void> {
  await db.execute(
    sql`SELECT set_config('app.current_org_id', ${orgId}, false)`,
  );
}

/**
 * Set the user context for RLS queries in tests.
 * Used by tests that intentionally validate user-scoped DB helpers.
 */
export async function setTestUserContext(
  db: TestDatabase,
  userId: string,
): Promise<void> {
  await db.execute(
    sql`SELECT set_config('app.current_user_id', ${userId}, false)`,
  );
}

/**
 * Set both org and user context for RLS queries in tests.
 */
export async function setTestContext(
  db: TestDatabase,
  orgId: string,
  userId: string,
): Promise<void> {
  await Promise.all([
    db.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, false)`),
    db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, false)`),
  ]);
}

/**
 * Clear the org context.
 */
export async function clearTestOrgContext(db: TestDatabase): Promise<void> {
  await db.execute(sql`SELECT set_config('app.current_org_id', '', false)`);
}

/**
 * Clear the user context.
 */
export async function clearTestUserContext(db: TestDatabase): Promise<void> {
  await db.execute(sql`SELECT set_config('app.current_user_id', '', false)`);
}

/**
 * Clear both org and user context.
 */
export async function clearTestContext(db: TestDatabase): Promise<void> {
  await Promise.all([
    db.execute(sql`SELECT set_config('app.current_org_id', '', false)`),
    db.execute(sql`SELECT set_config('app.current_user_id', '', false)`),
  ]);
}

/**
 * Run a function with a specific org context set, then clear context.
 */
export async function withTestOrgContext<T>(
  db: TestDatabase,
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

/**
 * Run a function with both org and user context set, then clear context.
 */
export async function withTestContext<T>(
  db: TestDatabase,
  orgId: string,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await setTestContext(db, orgId, userId);
  try {
    return await fn();
  } finally {
    await clearTestContext(db);
  }
}
