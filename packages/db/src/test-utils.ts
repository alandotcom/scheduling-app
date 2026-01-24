// Test utilities using PGLite for fast, in-memory Postgres testing

import { PGlite } from '@electric-sql/pglite'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import { sql } from 'drizzle-orm'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as schema from './schema/index.js'

// In-memory test database (fast, no RLS enforcement)
let testClient: PGlite | null = null
let testDb: PgliteDatabase<typeof schema> | null = null

// File-based test database for RLS enforcement testing
let rlsTestClient: PGlite | null = null
let rlsTestDb: PgliteDatabase<typeof schema> | null = null
let rlsDataDir: string | null = null
let rlsSuperuserClient: PGlite | null = null

const RLS_TEST_USER = 'rls_test_user'

/**
 * Create a test database using PGLite (in-process Postgres)
 * This is much faster than using a real Postgres server for tests
 */
export async function createTestDb(): Promise<PgliteDatabase<typeof schema>> {
  if (testDb) return testDb

  testClient = new PGlite()
  testDb = drizzle(testClient, { schema })

  // Create tables using raw SQL since PGLite doesn't support drizzle-kit push
  await testClient.exec(`
    -- Enable UUID extension for uuidv7
    -- PGLite doesn't have uuidv7() so we use gen_random_uuid() for tests
    CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid AS $$
      SELECT gen_random_uuid();
    $$ LANGUAGE SQL;

    -- Core tables
    CREATE TABLE IF NOT EXISTS orgs (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      email TEXT NOT NULL UNIQUE,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE,
      name TEXT,
      image TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS org_memberships (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      org_id UUID NOT NULL REFERENCES orgs(id),
      user_id UUID NOT NULL REFERENCES users(id),
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS org_memberships_org_user_idx ON org_memberships(org_id, user_id);

    CREATE TABLE IF NOT EXISTS locations (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      org_id UUID NOT NULL REFERENCES orgs(id),
      name TEXT NOT NULL,
      timezone TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS calendars (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      org_id UUID NOT NULL REFERENCES orgs(id),
      location_id UUID REFERENCES locations(id),
      name TEXT NOT NULL,
      timezone TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS appointment_types (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      org_id UUID NOT NULL REFERENCES orgs(id),
      name TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      padding_before_min INTEGER DEFAULT 0,
      padding_after_min INTEGER DEFAULT 0,
      capacity INTEGER DEFAULT 1,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS appointment_type_calendars (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      appointment_type_id UUID NOT NULL REFERENCES appointment_types(id),
      calendar_id UUID NOT NULL REFERENCES calendars(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS appointment_type_calendars_type_calendar_idx ON appointment_type_calendars(appointment_type_id, calendar_id);

    CREATE TABLE IF NOT EXISTS resources (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      org_id UUID NOT NULL REFERENCES orgs(id),
      location_id UUID REFERENCES locations(id),
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS appointment_type_resources (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      appointment_type_id UUID NOT NULL REFERENCES appointment_types(id),
      resource_id UUID NOT NULL REFERENCES resources(id),
      quantity_required INTEGER NOT NULL DEFAULT 1
    );
    CREATE UNIQUE INDEX IF NOT EXISTS appointment_type_resources_type_resource_idx ON appointment_type_resources(appointment_type_id, resource_id);

    CREATE TABLE IF NOT EXISTS clients (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      org_id UUID NOT NULL REFERENCES orgs(id),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      org_id UUID NOT NULL REFERENCES orgs(id),
      calendar_id UUID NOT NULL REFERENCES calendars(id),
      appointment_type_id UUID NOT NULL REFERENCES appointment_types(id),
      client_id UUID REFERENCES clients(id),
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ NOT NULL,
      timezone TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Availability tables
    CREATE TABLE IF NOT EXISTS availability_rules (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      calendar_id UUID NOT NULL REFERENCES calendars(id),
      weekday INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      interval_min INTEGER,
      group_id UUID
    );

    CREATE TABLE IF NOT EXISTS availability_overrides (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      calendar_id UUID NOT NULL REFERENCES calendars(id),
      date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      is_blocked BOOLEAN DEFAULT FALSE,
      interval_min INTEGER,
      group_id UUID
    );

    CREATE TABLE IF NOT EXISTS blocked_time (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      calendar_id UUID NOT NULL REFERENCES calendars(id),
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ NOT NULL,
      recurring_rule TEXT
    );

    CREATE TABLE IF NOT EXISTS scheduling_limits (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      calendar_id UUID REFERENCES calendars(id),
      group_id UUID,
      min_notice_hours INTEGER,
      max_notice_days INTEGER,
      max_per_slot INTEGER,
      max_per_day INTEGER,
      max_per_week INTEGER
    );

    -- Event outbox
    CREATE TABLE IF NOT EXISTS event_outbox (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      org_id UUID NOT NULL REFERENCES orgs(id),
      type TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL,
      next_attempt_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Auth tables (BetterAuth)
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      access_token_expires_at TIMESTAMPTZ,
      refresh_token_expires_at TIMESTAMPTZ,
      scope TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS verifications (
      id UUID PRIMARY KEY DEFAULT uuidv7(),
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- RLS helper function
    CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid AS $$
      SELECT nullif(current_setting('app.current_org_id', true), '')::uuid;
    $$ LANGUAGE SQL STABLE;

    -- Enable RLS on org-scoped tables
    -- FORCE ROW LEVEL SECURITY ensures policies apply even to table owner (superuser in PGLite)
    ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE locations FORCE ROW LEVEL SECURITY;
    CREATE POLICY org_isolation_locations ON locations
      FOR ALL USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

    ALTER TABLE calendars ENABLE ROW LEVEL SECURITY;
    ALTER TABLE calendars FORCE ROW LEVEL SECURITY;
    CREATE POLICY org_isolation_calendars ON calendars
      FOR ALL USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

    ALTER TABLE appointment_types ENABLE ROW LEVEL SECURITY;
    ALTER TABLE appointment_types FORCE ROW LEVEL SECURITY;
    CREATE POLICY org_isolation_appointment_types ON appointment_types
      FOR ALL USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

    ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
    ALTER TABLE resources FORCE ROW LEVEL SECURITY;
    CREATE POLICY org_isolation_resources ON resources
      FOR ALL USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

    ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
    ALTER TABLE clients FORCE ROW LEVEL SECURITY;
    CREATE POLICY org_isolation_clients ON clients
      FOR ALL USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

    ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
    CREATE POLICY org_isolation_appointments ON appointments
      FOR ALL USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

    ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
    ALTER TABLE event_outbox FORCE ROW LEVEL SECURITY;
    CREATE POLICY org_isolation_event_outbox ON event_outbox
      FOR ALL USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());
  `)

  return testDb
}

/**
 * Reset the test database by truncating all tables
 * Use this in beforeEach to ensure test isolation
 */
export async function resetTestDb(): Promise<void> {
  if (!testClient) return

  // Truncate all tables in reverse dependency order
  await testClient.exec(`
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
      users,
      orgs
    CASCADE;
  `)
}

/**
 * Close the test database connection
 * Use this in afterAll to clean up
 */
export async function closeTestDb(): Promise<void> {
  if (testClient) {
    await testClient.close()
    testClient = null
    testDb = null
  }
}

/**
 * Seed a test organization with a user
 * Useful for setting up basic test fixtures
 */
export async function seedTestOrg(db: PgliteDatabase<typeof schema>) {
  const [org] = await db.insert(schema.orgs).values({
    name: 'Test Org',
  }).returning()

  const [user] = await db.insert(schema.users).values({
    email: 'test@example.com',
    name: 'Test User',
    emailVerified: true,
  }).returning()

  await db.insert(schema.orgMemberships).values({
    orgId: org!.id,
    userId: user!.id,
    role: 'admin',
  })

  return { org: org!, user: user! }
}

/**
 * Get the current test database instance
 * Throws if createTestDb hasn't been called
 */
export function getTestDb(): PgliteDatabase<typeof schema> {
  if (!testDb) {
    throw new Error('Test database not initialized. Call createTestDb() first.')
  }
  return testDb
}

/**
 * Set the org context for RLS queries in tests
 * All subsequent queries will be filtered to this org
 */
export async function setTestOrgContext(db: PgliteDatabase<typeof schema>, orgId: string): Promise<void> {
  await db.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, false)`)
}

/**
 * Clear the org context (queries will return no rows due to RLS)
 */
export async function clearTestOrgContext(db: PgliteDatabase<typeof schema>): Promise<void> {
  await db.execute(sql`SELECT set_config('app.current_org_id', '', false)`)
}

/**
 * Run a function with a specific org context set, then restore previous context
 */
export async function withTestOrgContext<T>(
  db: PgliteDatabase<typeof schema>,
  orgId: string,
  fn: () => Promise<T>
): Promise<T> {
  await setTestOrgContext(db, orgId)
  try {
    return await fn()
  } finally {
    await clearTestOrgContext(db)
  }
}

/**
 * Seed a second test organization for RLS isolation testing
 */
export async function seedSecondTestOrg(db: PgliteDatabase<typeof schema>) {
  const [org] = await db.insert(schema.orgs).values({
    name: 'Second Test Org',
  }).returning()

  const [user] = await db.insert(schema.users).values({
    email: 'second@example.com',
    name: 'Second User',
    emailVerified: true,
  }).returning()

  await db.insert(schema.orgMemberships).values({
    orgId: org!.id,
    userId: user!.id,
    role: 'admin',
  })

  return { org: org!, user: user! }
}

// =============================================================================
// RLS-AWARE TEST UTILITIES
// =============================================================================
//
// These utilities create a file-based PGLite database with a non-superuser
// connection. Unlike the in-memory utilities above, RLS policies are actually
// enforced because the test user does NOT have the bypass_rls privilege.
//
// Use these for tests that verify RLS actually blocks unauthorized access.

/**
 * SQL to create the schema (shared between in-memory and file-based tests)
 */
const SCHEMA_SQL = `
  -- Enable UUID extension for uuidv7
  -- PGLite doesn't have uuidv7() so we use gen_random_uuid() for tests
  CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid AS $$
    SELECT gen_random_uuid();
  $$ LANGUAGE SQL;

  -- Core tables
  CREATE TABLE IF NOT EXISTS orgs (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    email TEXT NOT NULL UNIQUE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    name TEXT,
    image TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS org_memberships (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    user_id UUID NOT NULL REFERENCES users(id),
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS org_memberships_org_user_idx ON org_memberships(org_id, user_id);

  CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    name TEXT NOT NULL,
    timezone TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS calendars (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    location_id UUID REFERENCES locations(id),
    name TEXT NOT NULL,
    timezone TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS appointment_types (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    name TEXT NOT NULL,
    duration_min INTEGER NOT NULL,
    padding_before_min INTEGER DEFAULT 0,
    padding_after_min INTEGER DEFAULT 0,
    capacity INTEGER DEFAULT 1,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS appointment_type_calendars (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    appointment_type_id UUID NOT NULL REFERENCES appointment_types(id),
    calendar_id UUID NOT NULL REFERENCES calendars(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS appointment_type_calendars_type_calendar_idx ON appointment_type_calendars(appointment_type_id, calendar_id);

  CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    location_id UUID REFERENCES locations(id),
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS appointment_type_resources (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    appointment_type_id UUID NOT NULL REFERENCES appointment_types(id),
    resource_id UUID NOT NULL REFERENCES resources(id),
    quantity_required INTEGER NOT NULL DEFAULT 1
  );
  CREATE UNIQUE INDEX IF NOT EXISTS appointment_type_resources_type_resource_idx ON appointment_type_resources(appointment_type_id, resource_id);

  CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    calendar_id UUID NOT NULL REFERENCES calendars(id),
    appointment_type_id UUID NOT NULL REFERENCES appointment_types(id),
    client_id UUID REFERENCES clients(id),
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    timezone TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Availability tables
  CREATE TABLE IF NOT EXISTS availability_rules (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    calendar_id UUID NOT NULL REFERENCES calendars(id),
    weekday INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    interval_min INTEGER,
    group_id UUID
  );

  CREATE TABLE IF NOT EXISTS availability_overrides (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    calendar_id UUID NOT NULL REFERENCES calendars(id),
    date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    is_blocked BOOLEAN DEFAULT FALSE,
    interval_min INTEGER,
    group_id UUID
  );

  CREATE TABLE IF NOT EXISTS blocked_time (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    calendar_id UUID NOT NULL REFERENCES calendars(id),
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    recurring_rule TEXT
  );

  CREATE TABLE IF NOT EXISTS scheduling_limits (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    calendar_id UUID REFERENCES calendars(id),
    group_id UUID,
    min_notice_hours INTEGER,
    max_notice_days INTEGER,
    max_per_slot INTEGER,
    max_per_day INTEGER,
    max_per_week INTEGER
  );

  -- Event outbox
  CREATE TABLE IF NOT EXISTS event_outbox (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    org_id UUID NOT NULL REFERENCES orgs(id),
    type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL,
    next_attempt_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Auth tables (BetterAuth)
  CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    access_token_expires_at TIMESTAMPTZ,
    refresh_token_expires_at TIMESTAMPTZ,
    scope TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS verifications (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- RLS helper function
  CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid AS $$
    SELECT nullif(current_setting('app.current_org_id', true), '')::uuid;
  $$ LANGUAGE SQL STABLE;
`

/**
 * SQL to enable RLS and create policies
 */
const RLS_POLICIES_SQL = `
  -- Enable RLS on org-scoped tables
  ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE locations FORCE ROW LEVEL SECURITY;
  CREATE POLICY org_isolation_locations ON locations
    FOR ALL USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

  ALTER TABLE calendars ENABLE ROW LEVEL SECURITY;
  ALTER TABLE calendars FORCE ROW LEVEL SECURITY;
  CREATE POLICY org_isolation_calendars ON calendars
    FOR ALL USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

  ALTER TABLE appointment_types ENABLE ROW LEVEL SECURITY;
  ALTER TABLE appointment_types FORCE ROW LEVEL SECURITY;
  CREATE POLICY org_isolation_appointment_types ON appointment_types
    FOR ALL USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

  ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
  ALTER TABLE resources FORCE ROW LEVEL SECURITY;
  CREATE POLICY org_isolation_resources ON resources
    FOR ALL USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

  ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
  ALTER TABLE clients FORCE ROW LEVEL SECURITY;
  CREATE POLICY org_isolation_clients ON clients
    FOR ALL USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

  ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
  CREATE POLICY org_isolation_appointments ON appointments
    FOR ALL USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());

  ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
  ALTER TABLE event_outbox FORCE ROW LEVEL SECURITY;
  CREATE POLICY org_isolation_event_outbox ON event_outbox
    FOR ALL USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());
`

/**
 * Create a test database with RLS enforcement using a non-superuser connection.
 *
 * Unlike createTestDb(), this creates a file-based database and reconnects
 * as a non-superuser, so RLS policies are actually enforced.
 *
 * Use this for security tests that verify RLS actually blocks unauthorized access.
 */
export async function createTestDbWithRLS(): Promise<PgliteDatabase<typeof schema>> {
  if (rlsTestDb) return rlsTestDb

  // Create temp directory for database files
  rlsDataDir = await mkdtemp(join(tmpdir(), 'pglite-rls-'))

  // Step 1: Initialize as superuser and create schema
  rlsSuperuserClient = new PGlite(rlsDataDir)
  await rlsSuperuserClient.exec(SCHEMA_SQL)
  await rlsSuperuserClient.exec(RLS_POLICIES_SQL)

  // Step 2: Create test user and grant permissions
  await rlsSuperuserClient.exec(`
    CREATE USER ${RLS_TEST_USER} WITH PASSWORD 'test';

    -- Grant permissions to the test user
    GRANT USAGE ON SCHEMA public TO ${RLS_TEST_USER};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${RLS_TEST_USER};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${RLS_TEST_USER};
    GRANT EXECUTE ON FUNCTION uuidv7() TO ${RLS_TEST_USER};
    GRANT EXECUTE ON FUNCTION current_org_id() TO ${RLS_TEST_USER};
  `)

  // Close superuser connection
  await rlsSuperuserClient.close()

  // Step 3: Reconnect as non-superuser - RLS is now enforced!
  rlsTestClient = new PGlite({ dataDir: rlsDataDir, username: RLS_TEST_USER })
  rlsTestDb = drizzle(rlsTestClient, { schema })

  return rlsTestDb
}

/**
 * Reset the RLS test database by truncating all tables.
 * Requires reconnecting as superuser to truncate, then back to test user.
 */
export async function resetTestDbWithRLS(): Promise<void> {
  if (!rlsDataDir) return

  // Close test user connection
  if (rlsTestClient) {
    await rlsTestClient.close()
    rlsTestClient = null
    rlsTestDb = null
  }

  // Reconnect as superuser to truncate tables
  rlsSuperuserClient = new PGlite(rlsDataDir)
  await rlsSuperuserClient.exec(`
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
      users,
      orgs
    CASCADE;
  `)
  await rlsSuperuserClient.close()

  // Reconnect as test user
  rlsTestClient = new PGlite({ dataDir: rlsDataDir, username: RLS_TEST_USER })
  rlsTestDb = drizzle(rlsTestClient, { schema })
}

/**
 * Close the RLS test database and clean up temp directory.
 */
export async function closeTestDbWithRLS(): Promise<void> {
  if (rlsTestClient) {
    await rlsTestClient.close()
    rlsTestClient = null
    rlsTestDb = null
  }
  if (rlsSuperuserClient) {
    await rlsSuperuserClient.close()
    rlsSuperuserClient = null
  }
  if (rlsDataDir) {
    await rm(rlsDataDir, { recursive: true, force: true })
    rlsDataDir = null
  }
}

/**
 * Get the current RLS test database instance.
 */
export function getTestDbWithRLS(): PgliteDatabase<typeof schema> {
  if (!rlsTestDb) {
    throw new Error('RLS test database not initialized. Call createTestDbWithRLS() first.')
  }
  return rlsTestDb
}

/**
 * Seed data as superuser (bypasses RLS).
 * Use this to set up test fixtures that need to insert data for multiple orgs.
 *
 * @param fn - Function that receives the superuser db connection and returns data
 * @returns The data returned by fn
 */
export async function seedAsSuperuser<T>(
  fn: (db: PgliteDatabase<typeof schema>) => Promise<T>
): Promise<T> {
  if (!rlsDataDir) {
    throw new Error('RLS test database not initialized. Call createTestDbWithRLS() first.')
  }

  // Close test user connection
  if (rlsTestClient) {
    await rlsTestClient.close()
    rlsTestClient = null
    rlsTestDb = null
  }

  // Connect as superuser
  rlsSuperuserClient = new PGlite(rlsDataDir)
  const superuserDb = drizzle(rlsSuperuserClient, { schema })

  try {
    // Execute seeding function
    return await fn(superuserDb)
  } finally {
    // Close superuser and reconnect as test user
    await rlsSuperuserClient.close()
    rlsSuperuserClient = null

    rlsTestClient = new PGlite({ dataDir: rlsDataDir, username: RLS_TEST_USER })
    rlsTestDb = drizzle(rlsTestClient, { schema })
  }
}

/**
 * Set the org context for RLS queries in the RLS-enforced test database
 */
export async function setRLSTestOrgContext(orgId: string): Promise<void> {
  const db = getTestDbWithRLS()
  await db.execute(sql`SELECT set_config('app.current_org_id', ${orgId}, false)`)
}

/**
 * Clear the org context in the RLS-enforced test database
 */
export async function clearRLSTestOrgContext(): Promise<void> {
  const db = getTestDbWithRLS()
  await db.execute(sql`SELECT set_config('app.current_org_id', '', false)`)
}
