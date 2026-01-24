// Test utilities using PGLite for fast, in-memory Postgres testing

import { PGlite } from '@electric-sql/pglite'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import * as schema from './schema/index.js'

let testClient: PGlite | null = null
let testDb: PgliteDatabase<typeof schema> | null = null

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
