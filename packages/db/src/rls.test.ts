// RLS isolation tests - verify org data isolation
//
// This file contains two types of tests:
// 1. Context function tests (using in-memory PGLite as superuser) - verify helper functions work
// 2. RLS enforcement tests (using file-based PGLite as non-superuser) - verify RLS actually blocks access

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
  createTestDbWithRLS,
  resetTestDbWithRLS,
  closeTestDbWithRLS,
  seedAsSuperuser,
  setRLSTestOrgContext,
  clearRLSTestOrgContext,
  getTestDbWithRLS,
} from './test-utils.js'
import * as schemaModule from './schema/index.js'
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

// =============================================================================
// RLS ENFORCEMENT TESTS
// =============================================================================
//
// These tests use a file-based PGLite database with a non-superuser connection.
// RLS policies are ACTUALLY enforced, so these tests verify that unauthorized
// access is properly blocked.

describe('RLS isolation - enforced', () => {
  let rlsDb: PgliteDatabase<typeof schema>
  let orgA: { id: string; name: string }
  let orgB: { id: string; name: string }
  let _locationA: { id: string; orgId: string; name: string }
  let locationB: { id: string; orgId: string; name: string }

  beforeAll(async () => {
    rlsDb = await createTestDbWithRLS()
  })

  afterAll(async () => {
    await closeTestDbWithRLS()
  })

  beforeEach(async () => {
    await resetTestDbWithRLS()

    // Seed test data as superuser (bypasses RLS)
    const seeded = await seedAsSuperuser(async (superuserDb) => {
      // Create two orgs
      const [createdOrgA] = await superuserDb.insert(schemaModule.orgs).values({
        name: 'Org A',
      }).returning()

      const [createdOrgB] = await superuserDb.insert(schemaModule.orgs).values({
        name: 'Org B',
      }).returning()

      // Create a location for each org
      const [createdLocationA] = await superuserDb.insert(schemaModule.locations).values({
        orgId: createdOrgA!.id,
        name: 'Location A',
        timezone: 'America/New_York',
      }).returning()

      const [createdLocationB] = await superuserDb.insert(schemaModule.locations).values({
        orgId: createdOrgB!.id,
        name: 'Location B',
        timezone: 'America/Los_Angeles',
      }).returning()

      return {
        orgA: createdOrgA!,
        orgB: createdOrgB!,
        locationA: createdLocationA!,
        locationB: createdLocationB!,
      }
    })

    orgA = seeded.orgA
    orgB = seeded.orgB
    _locationA = seeded.locationA
    locationB = seeded.locationB

    // Get fresh db reference after seedAsSuperuser reconnects
    rlsDb = getTestDbWithRLS()
  })

  test('cannot read data from another org', async () => {
    // Set context to org A
    await setRLSTestOrgContext(orgA.id)

    // Query all locations - should only see org A's location
    const allLocations = await rlsDb.query.locations.findMany()

    expect(allLocations).toHaveLength(1)
    expect(allLocations[0]!.name).toBe('Location A')
    expect(allLocations[0]!.orgId).toBe(orgA.id)

    // Explicitly query for org B's location - should not find it
    const orgBLocation = await rlsDb.query.locations.findFirst({
      where: (loc, { eq }) => eq(loc.id, locationB.id),
    })
    expect(orgBLocation).toBeUndefined()

    await clearRLSTestOrgContext()
  })

  test('cannot insert data with wrong org_id', async () => {
    // Set context to org A
    await setRLSTestOrgContext(orgA.id)

    // Try to insert a location with org B's ID - should fail due to RLS WITH CHECK
    let insertError: Error | null = null
    try {
      await rlsDb.insert(locations).values({
        orgId: orgB.id, // Wrong org!
        name: 'Sneaky Location',
        timezone: 'America/Chicago',
      })
    } catch (err) {
      insertError = err as Error
    }

    expect(insertError).not.toBeNull()
    expect(insertError!.message).toMatch(/row-level security|violates row-level security policy/)

    await clearRLSTestOrgContext()
  })

  test('cannot update data from another org', async () => {
    // Set context to org A
    await setRLSTestOrgContext(orgA.id)

    // Try to update org B's location - should affect 0 rows (RLS filters it out)
    const result = await rlsDb.update(locations)
      .set({ name: 'Hacked Location' })
      .where(eq(locations.id, locationB.id))
      .returning()

    expect(result).toHaveLength(0)

    // Verify org B's location is unchanged (check as superuser)
    const unchanged = await seedAsSuperuser(async (superuserDb) => {
      return superuserDb.query.locations.findFirst({
        where: (loc, { eq }) => eq(loc.id, locationB.id),
      })
    })
    rlsDb = getTestDbWithRLS()

    expect(unchanged!.name).toBe('Location B')

    await clearRLSTestOrgContext()
  })

  test('cannot delete data from another org', async () => {
    // Set context to org A
    await setRLSTestOrgContext(orgA.id)

    // Try to delete org B's location - should affect 0 rows
    const result = await rlsDb.delete(locations)
      .where(eq(locations.id, locationB.id))
      .returning()

    expect(result).toHaveLength(0)

    // Verify org B's location still exists (check as superuser)
    const stillExists = await seedAsSuperuser(async (superuserDb) => {
      return superuserDb.query.locations.findFirst({
        where: (loc, { eq }) => eq(loc.id, locationB.id),
      })
    })
    rlsDb = getTestDbWithRLS()

    expect(stillExists).toBeDefined()
    expect(stillExists!.name).toBe('Location B')

    await clearRLSTestOrgContext()
  })

  test('returns empty results when no context set', async () => {
    // Clear any existing context
    await clearRLSTestOrgContext()

    // Query locations - should return empty (no org context set)
    const allLocations = await rlsDb.query.locations.findMany()
    expect(allLocations).toHaveLength(0)
  })

  test('switching org context shows different data', async () => {
    // Context A - see only A's data
    await setRLSTestOrgContext(orgA.id)
    let result = await rlsDb.query.locations.findMany()
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('Location A')

    // Context B - see only B's data
    await setRLSTestOrgContext(orgB.id)
    result = await rlsDb.query.locations.findMany()
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('Location B')

    await clearRLSTestOrgContext()
  })

  test('can insert and read own org data correctly', async () => {
    // Set context to org A
    await setRLSTestOrgContext(orgA.id)

    // Insert a new location for org A
    const [newLocation] = await rlsDb.insert(locations).values({
      orgId: orgA.id,
      name: 'New Location A',
      timezone: 'America/Denver',
    }).returning()

    expect(newLocation).toBeDefined()
    expect(newLocation!.orgId).toBe(orgA.id)

    // Can read it back
    const found = await rlsDb.query.locations.findFirst({
      where: (loc, { eq }) => eq(loc.id, newLocation!.id),
    })
    expect(found).toBeDefined()
    expect(found!.name).toBe('New Location A')

    await clearRLSTestOrgContext()
  })
})
