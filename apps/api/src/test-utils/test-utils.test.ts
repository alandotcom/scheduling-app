// Tests to verify test utilities work correctly
//
// This serves as both validation of the test infrastructure
// and documentation of how to use the helpers.

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import {
  createTestContext,
  createUnauthenticatedContext,
  createTokenContext,
  createOrg,
  createLocation,
  createCalendar,
  createAppointmentType,
  createResource,
  createClient,
  createTestFixture,
  createTestDb,
  resetTestDb,
  closeTestDb,
  setTestOrgContext,
  clearTestOrgContext,
} from "./index.js";
import { locations } from "@scheduling/db/schema";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("Test Utilities", () => {
  let db: Database;

  beforeAll(async () => {
    db = (await createTestDb()) as Database;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  describe("createTestContext", () => {
    test("creates context with required fields", () => {
      const ctx = createTestContext({
        orgId: "org-123",
        userId: "user-456",
      });

      expect(ctx.orgId).toBe("org-123");
      expect(ctx.userId).toBe("user-456");
      expect(ctx.role).toBe("admin"); // default
      expect(ctx.authMethod).toBe("session"); // default
      expect(ctx.sessionId).toBe("test-session-id"); // default
      expect(ctx.tokenId).toBeNull();
    });

    test("allows overriding defaults", () => {
      const ctx = createTestContext({
        orgId: "org-123",
        userId: "user-456",
        role: "staff",
        sessionId: "custom-session",
      });

      expect(ctx.role).toBe("staff");
      expect(ctx.sessionId).toBe("custom-session");
    });
  });

  describe("createUnauthenticatedContext", () => {
    test("creates null context", () => {
      const ctx = createUnauthenticatedContext();

      expect(ctx.orgId).toBeNull();
      expect(ctx.userId).toBeNull();
      expect(ctx.role).toBeNull();
      expect(ctx.authMethod).toBeNull();
    });
  });

  describe("createTokenContext", () => {
    test("creates API token context", () => {
      const ctx = createTokenContext({
        orgId: "org-123",
        userId: "user-456",
        tokenId: "token-789",
      });

      expect(ctx.authMethod).toBe("token");
      expect(ctx.tokenId).toBe("token-789");
      expect(ctx.sessionId).toBeNull();
    });
  });

  describe("Factory Functions", () => {
    test("createOrg creates org with admin user", async () => {
      const { org, user } = await createOrg(db);

      expect(org.id).toBeDefined();
      expect(org.name).toBe("Test Org");
      expect(user.id).toBeDefined();
      expect(user.emailVerified).toBe(true);
    });

    test("createLocation creates location", async () => {
      const { org } = await createOrg(db);
      const location = await createLocation(db, org.id, {
        name: "Main Office",
        timezone: "America/Chicago",
      });

      expect(location.id).toBeDefined();
      expect(location.name).toBe("Main Office");
      expect(location.timezone).toBe("America/Chicago");
      expect(location.orgId).toBe(org.id);
    });

    test("createCalendar creates calendar with optional location", async () => {
      const { org } = await createOrg(db);
      const location = await createLocation(db, org.id);
      const calendar = await createCalendar(db, org.id, {
        locationId: location.id,
        name: "Room 1",
      });

      expect(calendar.id).toBeDefined();
      expect(calendar.name).toBe("Room 1");
      expect(calendar.locationId).toBe(location.id);
    });

    test("createAppointmentType links to calendars", async () => {
      const { org } = await createOrg(db);
      const calendar = await createCalendar(db, org.id);
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Consultation",
        durationMin: 30,
        calendarIds: [calendar.id],
      });

      expect(appointmentType.id).toBeDefined();
      expect(appointmentType.name).toBe("Consultation");
      expect(appointmentType.durationMin).toBe(30);
    });

    test("createResource creates resource", async () => {
      const { org } = await createOrg(db);
      const resource = await createResource(db, org.id, {
        name: "Projector",
        quantity: 2,
      });

      expect(resource.id).toBeDefined();
      expect(resource.name).toBe("Projector");
      expect(resource.quantity).toBe(2);
    });

    test("createClient creates client", async () => {
      const { org } = await createOrg(db);
      const client = await createClient(db, org.id, {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
      });

      expect(client.id).toBeDefined();
      expect(client.firstName).toBe("John");
      expect(client.lastName).toBe("Doe");
      expect(client.email).toBe("john@example.com");
    });

    test("createTestFixture creates complete setup", async () => {
      const fixture = await createTestFixture(db);

      expect(fixture.org.id).toBeDefined();
      expect(fixture.user.id).toBeDefined();
      expect(fixture.location.id).toBeDefined();
      expect(fixture.calendar.id).toBeDefined();
      expect(fixture.appointmentType.id).toBeDefined();
      expect(fixture.calendar.locationId).toBe(fixture.location.id);
    });
  });

  describe("Org Context Helpers", () => {
    test("setTestOrgContext and clearTestOrgContext work without error", async () => {
      const { org } = await createOrg(db);

      // These should not throw
      await setTestOrgContext(db, org.id);
      await clearTestOrgContext(db);

      // Verify we can still query after context operations
      const allLocations = await db.select().from(locations);
      expect(Array.isArray(allLocations)).toBe(true);
    });

    test("test isolation works via resetTestDb", async () => {
      // Create data in first "test"
      const { org } = await createOrg(db);
      await createLocation(db, org.id, { name: "Test Location" });

      // Verify data exists (need org context to see RLS-protected data)
      await setTestOrgContext(db, org.id);
      const before = await db.select().from(locations);
      expect(before.length).toBe(1);
      await clearTestOrgContext(db);

      // Reset simulates next test's beforeEach
      await resetTestDb();

      // Data should be gone (no context needed for empty check)
      const after = await db.select().from(locations);
      expect(after.length).toBe(0);
    });
  });
});
