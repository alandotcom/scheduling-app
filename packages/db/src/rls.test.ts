// RLS isolation tests - verify org data isolation
//
// These tests verify RLS policies and context functions work correctly.
// With real Postgres, RLS is enforced natively when org context is set.

import {
  describe,
  test,
  expect,
} from "bun:test";
import {
  getTestDb,
  type TestDatabase,
  seedTestOrg,
  seedSecondTestOrg,
  setTestOrgContext,
  clearTestOrgContext,
  withTestOrgContext,
} from "./test-utils.js";
import {
  locations,
  calendars,
  appointmentTypes,
  resources,
  clients,
  workflows,
} from "./schema/index.js";
import { eq, sql } from "drizzle-orm";

function getRows<T extends Record<string, unknown>>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}
const db: TestDatabase = getTestDb();

describe("RLS context functions", () => {
  test("current_org_id() returns null when no context set", async () => {
    await clearTestOrgContext(db);
    const rows = getRows<{ current_org_id: string | null }>(
      await db.execute(sql`SELECT current_org_id()`),
    );
    expect(rows[0]?.current_org_id).toBeNull();
  });

  test("current_org_id() returns the set org id", async () => {
    const { org } = await seedTestOrg(db);
    await setTestOrgContext(db, org.id);
    const rows = getRows<{ current_org_id: string | null }>(
      await db.execute(sql`SELECT current_org_id()`),
    );
    expect(rows[0]?.current_org_id).toBe(org.id);
  });

  test("setTestOrgContext sets the context correctly", async () => {
    const { org: orgA } = await seedTestOrg(db);
    const { org: orgB } = await seedSecondTestOrg(db);

    await setTestOrgContext(db, orgA.id);
    let rows = getRows<{ current_org_id: string | null }>(
      await db.execute(sql`SELECT current_org_id()`),
    );
    expect(rows[0]?.current_org_id).toBe(orgA.id);

    await setTestOrgContext(db, orgB.id);
    rows = getRows<{ current_org_id: string | null }>(
      await db.execute(sql`SELECT current_org_id()`),
    );
    expect(rows[0]?.current_org_id).toBe(orgB.id);
  });

  test("clearTestOrgContext clears the context", async () => {
    const { org } = await seedTestOrg(db);

    await setTestOrgContext(db, org.id);
    let rows = getRows<{ current_org_id: string | null }>(
      await db.execute(sql`SELECT current_org_id()`),
    );
    expect(rows[0]?.current_org_id).toBe(org.id);

    await clearTestOrgContext(db);
    rows = getRows<{ current_org_id: string | null }>(
      await db.execute(sql`SELECT current_org_id()`),
    );
    expect(rows[0]?.current_org_id).toBeNull();
  });

  test("withTestOrgContext restores context after execution", async () => {
    const { org: orgA } = await seedTestOrg(db);
    const { org: orgB } = await seedSecondTestOrg(db);

    // Set initial context to org A
    await setTestOrgContext(db, orgA.id);

    // Execute with org B context
    const orgIdDuringExec = await withTestOrgContext(db, orgB.id, async () => {
      const rows = getRows<{ current_org_id: string | null }>(
        await db.execute(sql`SELECT current_org_id()`),
      );
      return rows[0]?.current_org_id;
    });

    expect(orgIdDuringExec).toBe(orgB.id);

    // Context should be cleared (withTestOrgContext clears after)
    const rows = getRows<{ current_org_id: string | null }>(
      await db.execute(sql`SELECT current_org_id()`),
    );
    expect(rows[0]?.current_org_id).toBeNull();
  });
});

describe("CRUD operations with org context", () => {
  test("can insert and query locations with org context", async () => {
    const { org } = await seedTestOrg(db);

    await setTestOrgContext(db, org.id);

    const [location] = await db
      .insert(locations)
      .values({
        orgId: org.id,
        name: "Test Location",
        timezone: "America/New_York",
      })
      .returning();

    expect(location).toBeDefined();
    expect(location!.name).toBe("Test Location");
    expect(location!.orgId).toBe(org.id);

    // Can read it back
    const found = await db.query.locations.findFirst({
      where: { id: location!.id },
    });
    expect(found).toBeDefined();
    expect(found!.name).toBe("Test Location");

    await clearTestOrgContext(db);
  });

  test("can update locations with org context", async () => {
    const { org } = await seedTestOrg(db);

    await setTestOrgContext(db, org.id);

    const [location] = await db
      .insert(locations)
      .values({
        orgId: org.id,
        name: "Original Name",
        timezone: "America/New_York",
      })
      .returning();

    const [updated] = await db
      .update(locations)
      .set({ name: "Updated Name" })
      .where(eq(locations.id, location!.id))
      .returning();

    expect(updated!.name).toBe("Updated Name");

    await clearTestOrgContext(db);
  });

  test("can delete locations with org context", async () => {
    const { org } = await seedTestOrg(db);

    await setTestOrgContext(db, org.id);

    const [location] = await db
      .insert(locations)
      .values({
        orgId: org.id,
        name: "To Delete",
        timezone: "America/New_York",
      })
      .returning();

    await db.delete(locations).where(eq(locations.id, location!.id));

    const found = await db.query.locations.findFirst({
      where: { id: location!.id },
    });
    expect(found).toBeUndefined();

    await clearTestOrgContext(db);
  });

  test("CRUD works across all org-scoped tables", async () => {
    const { org } = await seedTestOrg(db);
    await setTestOrgContext(db, org.id);

    // Insert into all org-scoped tables
    const [loc] = await db
      .insert(locations)
      .values({
        orgId: org.id,
        name: "Test Location",
        timezone: "America/New_York",
      })
      .returning();

    await db.insert(calendars).values({
      orgId: org.id,
      locationId: loc!.id,
      name: "Test Calendar",
      timezone: "America/New_York",
    });

    await db.insert(appointmentTypes).values({
      orgId: org.id,
      name: "Test Appointment Type",
      durationMin: 30,
    });

    await db.insert(resources).values({
      orgId: org.id,
      name: "Test Resource",
      quantity: 1,
    });

    await db.insert(clients).values({
      orgId: org.id,
      firstName: "Test",
      lastName: "Client",
    });

    await db.insert(workflows).values({
      orgId: org.id,
      name: "Test Workflow",
      graph: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      visibility: "private",
    });

    // Verify all data exists
    expect(await db.query.locations.findMany()).toHaveLength(1);
    expect(await db.query.calendars.findMany()).toHaveLength(1);
    expect(await db.query.appointmentTypes.findMany()).toHaveLength(1);
    expect(await db.query.resources.findMany()).toHaveLength(1);
    expect(await db.query.clients.findMany()).toHaveLength(1);
    expect(await db.query.workflows.findMany()).toHaveLength(1);

    await clearTestOrgContext(db);
  });

  test("RLS filters data by org context", async () => {
    // Create two orgs with data
    const { org: orgA } = await seedTestOrg(db);
    const { org: orgB } = await seedSecondTestOrg(db);

    // Insert location for org A (bypass RLS by not having context, or set context)
    await setTestOrgContext(db, orgA.id);
    await db.insert(locations).values({
      orgId: orgA.id,
      name: "Location A",
      timezone: "America/New_York",
    });

    await setTestOrgContext(db, orgB.id);
    await db.insert(locations).values({
      orgId: orgB.id,
      name: "Location B",
      timezone: "America/Los_Angeles",
    });

    // Query as org A - should only see org A's location
    await setTestOrgContext(db, orgA.id);
    const locationsA = await db.query.locations.findMany();
    expect(locationsA).toHaveLength(1);
    expect(locationsA[0]!.name).toBe("Location A");

    // Query as org B - should only see org B's location
    await setTestOrgContext(db, orgB.id);
    const locationsB = await db.query.locations.findMany();
    expect(locationsB).toHaveLength(1);
    expect(locationsB[0]!.name).toBe("Location B");

    await clearTestOrgContext(db);
  });

  test("RLS filters workflows by org context", async () => {
    const { org: orgA } = await seedTestOrg(db);
    const { org: orgB } = await seedSecondTestOrg(db);

    await setTestOrgContext(db, orgA.id);
    await db.insert(workflows).values({
      orgId: orgA.id,
      name: "Workflow A",
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      visibility: "private",
    });

    await setTestOrgContext(db, orgB.id);
    await db.insert(workflows).values({
      orgId: orgB.id,
      name: "Workflow B",
      graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      visibility: "private",
    });

    await setTestOrgContext(db, orgA.id);
    const workflowsA = await db.query.workflows.findMany();
    expect(workflowsA).toHaveLength(1);
    expect(workflowsA[0]!.name).toBe("Workflow A");

    await setTestOrgContext(db, orgB.id);
    const workflowsB = await db.query.workflows.findMany();
    expect(workflowsB).toHaveLength(1);
    expect(workflowsB[0]!.name).toBe("Workflow B");

    await clearTestOrgContext(db);
  });
});
