// RLS isolation tests - verify org data isolation
//
// NOTE: PGLite does not enforce RLS policies (it runs as superuser).
// These tests verify that:
// 1. The current_org_id() function works correctly
// 2. The org context can be set and cleared
// 3. The withOrg helper works for transactional context
//
// Actual RLS enforcement is tested in integration tests against real Postgres.

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import {
  createTestDb,
  resetTestDb,
  closeTestDb,
  seedTestOrg,
  seedSecondTestOrg,
  setTestOrgContext,
  clearTestOrgContext,
  withTestOrgContext,
} from './test-utils.js'
import { locations, calendars, appointmentTypes, resources, clients } from './schema/index.js'
import { eq, sql } from 'drizzle-orm'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import type * as schema from './schema/index.js'

let db: PgliteDatabase<typeof schema>

beforeAll(async () => {
  db = await createTestDb()
})

afterAll(async () => {
  await closeTestDb()
})

beforeEach(async () => {
  await resetTestDb()
})

describe('RLS context functions', () => {
  test('current_org_id() returns null when no context set', async () => {
    await clearTestOrgContext(db)
    const result = await db.execute(sql`SELECT current_org_id()`)
    expect(result.rows[0]?.['current_org_id']).toBeNull()
  })

  test('current_org_id() returns the set org id', async () => {
    const { org } = await seedTestOrg(db)
    await setTestOrgContext(db, org.id)
    const result = await db.execute(sql`SELECT current_org_id()`)
    expect(result.rows[0]?.['current_org_id']).toBe(org.id)
  })

  test('setTestOrgContext sets the context correctly', async () => {
    const { org: orgA } = await seedTestOrg(db)
    const { org: orgB } = await seedSecondTestOrg(db)

    await setTestOrgContext(db, orgA.id)
    let result = await db.execute(sql`SELECT current_org_id()`)
    expect(result.rows[0]?.['current_org_id']).toBe(orgA.id)

    await setTestOrgContext(db, orgB.id)
    result = await db.execute(sql`SELECT current_org_id()`)
    expect(result.rows[0]?.['current_org_id']).toBe(orgB.id)
  })

  test('clearTestOrgContext clears the context', async () => {
    const { org } = await seedTestOrg(db)

    await setTestOrgContext(db, org.id)
    let result = await db.execute(sql`SELECT current_org_id()`)
    expect(result.rows[0]?.['current_org_id']).toBe(org.id)

    await clearTestOrgContext(db)
    result = await db.execute(sql`SELECT current_org_id()`)
    expect(result.rows[0]?.['current_org_id']).toBeNull()
  })

  test('withTestOrgContext restores context after execution', async () => {
    const { org: orgA } = await seedTestOrg(db)
    const { org: orgB } = await seedSecondTestOrg(db)

    // Set initial context to org A
    await setTestOrgContext(db, orgA.id)

    // Execute with org B context
    const orgIdDuringExec = await withTestOrgContext(db, orgB.id, async () => {
      const result = await db.execute(sql`SELECT current_org_id()`)
      return result.rows[0]?.['current_org_id']
    })

    expect(orgIdDuringExec).toBe(orgB.id)

    // Context should be cleared (withTestOrgContext clears after)
    const result = await db.execute(sql`SELECT current_org_id()`)
    expect(result.rows[0]?.['current_org_id']).toBeNull()
  })
})

describe('RLS policy setup verification', () => {
  test('RLS is enabled on org-scoped tables', async () => {
    // Query pg_tables to verify RLS is enabled
    const result = await db.execute(sql`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('locations', 'calendars', 'appointment_types', 'resources', 'clients', 'appointments', 'event_outbox')
      ORDER BY tablename
    `)

    const tables = result.rows as Array<{ tablename: string; rowsecurity: boolean }>

    expect(tables).toHaveLength(7)
    for (const table of tables) {
      expect(table.rowsecurity).toBe(true)
    }
  })

  test('RLS policies exist for org isolation', async () => {
    const result = await db.execute(sql`
      SELECT tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename
    `)

    const policies = result.rows as Array<{ tablename: string; policyname: string }>

    const expectedTables = [
      'appointment_types',
      'appointments',
      'calendars',
      'clients',
      'event_outbox',
      'locations',
      'resources',
    ]

    for (const tableName of expectedTables) {
      const policy = policies.find(p => p.tablename === tableName)
      expect(policy).toBeDefined()
      expect(policy?.policyname).toBe(`org_isolation_${tableName}`)
    }
  })
})

describe('CRUD operations with org context', () => {
  test('can insert and query locations with org context', async () => {
    const { org } = await seedTestOrg(db)

    await setTestOrgContext(db, org.id)

    const [location] = await db.insert(locations).values({
      orgId: org.id,
      name: 'Test Location',
      timezone: 'America/New_York',
    }).returning()

    expect(location).toBeDefined()
    expect(location!.name).toBe('Test Location')
    expect(location!.orgId).toBe(org.id)

    // Can read it back
    const found = await db.query.locations.findFirst({
      where: (loc, { eq }) => eq(loc.id, location!.id),
    })
    expect(found).toBeDefined()
    expect(found!.name).toBe('Test Location')

    await clearTestOrgContext(db)
  })

  test('can update locations with org context', async () => {
    const { org } = await seedTestOrg(db)

    await setTestOrgContext(db, org.id)

    const [location] = await db.insert(locations).values({
      orgId: org.id,
      name: 'Original Name',
      timezone: 'America/New_York',
    }).returning()

    const [updated] = await db.update(locations)
      .set({ name: 'Updated Name' })
      .where(eq(locations.id, location!.id))
      .returning()

    expect(updated!.name).toBe('Updated Name')

    await clearTestOrgContext(db)
  })

  test('can delete locations with org context', async () => {
    const { org } = await seedTestOrg(db)

    await setTestOrgContext(db, org.id)

    const [location] = await db.insert(locations).values({
      orgId: org.id,
      name: 'To Delete',
      timezone: 'America/New_York',
    }).returning()

    await db.delete(locations).where(eq(locations.id, location!.id))

    const found = await db.query.locations.findFirst({
      where: (loc, { eq }) => eq(loc.id, location!.id),
    })
    expect(found).toBeUndefined()

    await clearTestOrgContext(db)
  })

  test('CRUD works across all org-scoped tables', async () => {
    const { org } = await seedTestOrg(db)
    await setTestOrgContext(db, org.id)

    // Insert into all org-scoped tables
    const [loc] = await db.insert(locations).values({
      orgId: org.id,
      name: 'Test Location',
      timezone: 'America/New_York',
    }).returning()

    await db.insert(calendars).values({
      orgId: org.id,
      locationId: loc!.id,
      name: 'Test Calendar',
      timezone: 'America/New_York',
    })

    await db.insert(appointmentTypes).values({
      orgId: org.id,
      name: 'Test Appointment Type',
      durationMin: 30,
    })

    await db.insert(resources).values({
      orgId: org.id,
      name: 'Test Resource',
      quantity: 1,
    })

    await db.insert(clients).values({
      orgId: org.id,
      firstName: 'Test',
      lastName: 'Client',
    })

    // Verify all data exists
    expect(await db.query.locations.findMany()).toHaveLength(1)
    expect(await db.query.calendars.findMany()).toHaveLength(1)
    expect(await db.query.appointmentTypes.findMany()).toHaveLength(1)
    expect(await db.query.resources.findMany()).toHaveLength(1)
    expect(await db.query.clients.findMany()).toHaveLength(1)

    await clearTestOrgContext(db)
  })
})
