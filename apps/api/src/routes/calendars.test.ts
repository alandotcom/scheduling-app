// Integration tests for calendar routes
// Tests actual handler logic with database operations

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import {
  call,
  createTestContext,
  createOrg,
  createLocation,
  createCalendar,
  createTestDb,
  resetTestDb,
  closeTestDb,
  setTestOrgContext,
} from "../test-utils/index.js";
import * as calendarRoutes from "./calendars.js";
import { calendars } from "@scheduling/db/schema";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("Calendar Routes", () => {
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

  describe("list", () => {
    test("returns empty list when no calendars exist", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        calendarRoutes.list,
        { limit: 10 },
        { context: ctx },
      );

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    test("returns calendars for the org", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createCalendar(db, org.id, { name: "Calendar 1" });
      await createCalendar(db, org.id, { name: "Calendar 2" });

      const result = await call(
        calendarRoutes.list,
        { limit: 10 },
        { context: ctx },
      );

      expect(result.items).toHaveLength(2);
      expect(result.items.map((c) => c.name).sort()).toEqual([
        "Calendar 1",
        "Calendar 2",
      ]);
      expect(result.hasMore).toBe(false);
    });

    test("supports cursor pagination", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createCalendar(db, org.id, { name: "Calendar 1" });
      await createCalendar(db, org.id, { name: "Calendar 2" });
      await createCalendar(db, org.id, { name: "Calendar 3" });

      const first = await call(
        calendarRoutes.list,
        { limit: 2 },
        { context: ctx },
      );

      expect(first.items).toHaveLength(2);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toBeDefined();

      const second = await call(
        calendarRoutes.list,
        { limit: 2, cursor: first.nextCursor! },
        { context: ctx },
      );

      expect(second.items).toHaveLength(1);
      expect(second.hasMore).toBe(false);
    });

    test("filters by locationId", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const location = await createLocation(db, org.id, {
        name: "Test Location",
      });

      await createCalendar(db, org.id, { name: "Global Calendar" });
      await createCalendar(db, org.id, {
        name: "Location Calendar",
        locationId: location.id,
      });

      const result = await call(
        calendarRoutes.list,
        { limit: 10, locationId: location.id },
        { context: ctx },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe("Location Calendar");
    });

    test("does not return calendars from other orgs (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      await createCalendar(db, org1.id, { name: "Org 1 Calendar" });
      await createCalendar(db, org2.id, { name: "Org 2 Calendar" });

      const result = await call(
        calendarRoutes.list,
        { limit: 10 },
        { context: ctx1 },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe("Org 1 Calendar");
    });
  });

  describe("get", () => {
    test("returns calendar by id", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const calendar = await createCalendar(db, org.id, {
        name: "Test Calendar",
        timezone: "America/Chicago",
      });

      const result = await call(
        calendarRoutes.get,
        { id: calendar.id },
        { context: ctx },
      );

      expect(result.id).toBe(calendar.id);
      expect(result.name).toBe("Test Calendar");
      expect(result.timezone).toBe("America/Chicago");
    });

    test("throws NOT_FOUND for non-existent calendar", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          calendarRoutes.get,
          { id: "00000000-0000-0000-0000-000000000000" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for calendar in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const calendar = await createCalendar(db, org2.id, {
        name: "Org 2 Calendar",
      });

      await expect(
        call(calendarRoutes.get, { id: calendar.id }, { context: ctx1 }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("create", () => {
    test("creates a new calendar", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        calendarRoutes.create,
        { name: "New Calendar", timezone: "America/Los_Angeles" },
        { context: ctx },
      );

      expect(result).toBeDefined();
      expect(result!.name).toBe("New Calendar");
      expect(result!.timezone).toBe("America/Los_Angeles");
      expect(result!.orgId).toBe(org.id);

      // Verify in database
      await setTestOrgContext(db, org.id);
      const [dbCalendar] = await db.select().from(calendars);
      expect(dbCalendar!.name).toBe("New Calendar");
    });

    test("creates calendar with location", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const location = await createLocation(db, org.id, {
        name: "Test Location",
      });

      const result = await call(
        calendarRoutes.create,
        {
          name: "Location Calendar",
          timezone: "America/New_York",
          locationId: location.id,
        },
        { context: ctx },
      );

      expect(result!.locationId).toBe(location.id);
    });

    test("throws NOT_FOUND for non-existent location", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          calendarRoutes.create,
          {
            name: "Bad Calendar",
            timezone: "America/New_York",
            locationId: "00000000-0000-0000-0000-000000000000",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for location in different org", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const location = await createLocation(db, org2.id, {
        name: "Org 2 Location",
      });

      await expect(
        call(
          calendarRoutes.create,
          {
            name: "Bad Calendar",
            timezone: "America/New_York",
            locationId: location.id,
          },
          { context: ctx1 },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("update", () => {
    test("updates calendar name", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const calendar = await createCalendar(db, org.id, {
        name: "Original Name",
      });

      const result = await call(
        calendarRoutes.update,
        { id: calendar.id, data: { name: "Updated Name" } },
        { context: ctx },
      );

      expect(result!.name).toBe("Updated Name");
    });

    test("updates calendar timezone", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const calendar = await createCalendar(db, org.id, {
        timezone: "America/New_York",
      });

      const result = await call(
        calendarRoutes.update,
        { id: calendar.id, data: { timezone: "America/Chicago" } },
        { context: ctx },
      );

      expect(result!.timezone).toBe("America/Chicago");
    });

    test("updates calendar location", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const calendar = await createCalendar(db, org.id, { name: "Calendar" });
      const location = await createLocation(db, org.id, {
        name: "New Location",
      });

      const result = await call(
        calendarRoutes.update,
        { id: calendar.id, data: { locationId: location.id } },
        { context: ctx },
      );

      expect(result!.locationId).toBe(location.id);
    });

    test("throws NOT_FOUND for non-existent calendar", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          calendarRoutes.update,
          {
            id: "00000000-0000-0000-0000-000000000000",
            data: { name: "Updated" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for non-existent location", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const calendar = await createCalendar(db, org.id, { name: "Calendar" });

      await expect(
        call(
          calendarRoutes.update,
          {
            id: calendar.id,
            data: { locationId: "00000000-0000-0000-0000-000000000000" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for calendar in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const calendar = await createCalendar(db, org2.id, {
        name: "Org 2 Calendar",
      });

      await expect(
        call(
          calendarRoutes.update,
          { id: calendar.id, data: { name: "Hacked!" } },
          { context: ctx1 },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("remove", () => {
    test("deletes a calendar", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const calendar = await createCalendar(db, org.id, { name: "To Delete" });

      const result = await call(
        calendarRoutes.remove,
        { id: calendar.id },
        { context: ctx },
      );

      expect(result.success).toBe(true);

      // Verify deleted from database
      await setTestOrgContext(db, org.id);
      const remaining = await db.select().from(calendars);
      expect(remaining).toHaveLength(0);
    });

    test("throws NOT_FOUND for non-existent calendar", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          calendarRoutes.remove,
          { id: "00000000-0000-0000-0000-000000000000" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for calendar in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const calendar = await createCalendar(db, org2.id, {
        name: "Org 2 Calendar",
      });

      await expect(
        call(calendarRoutes.remove, { id: calendar.id }, { context: ctx1 }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("Module Exports", () => {
    test("calendar routes module exists and exports correctly", async () => {
      const routes = await import("./calendars.js");

      expect(routes.calendarRoutes).toBeDefined();
      expect(routes.calendarRoutes.list).toBeDefined();
      expect(routes.calendarRoutes.get).toBeDefined();
      expect(routes.calendarRoutes.create).toBeDefined();
      expect(routes.calendarRoutes.update).toBeDefined();
      expect(routes.calendarRoutes.remove).toBeDefined();
    });

    test("main router includes calendar routes", async () => {
      const { router } = await import("./index.js");

      expect(router).toBeDefined();
      expect(router.calendars).toBeDefined();
      expect(router.calendars.list).toBeDefined();
      expect(router.calendars.get).toBeDefined();
      expect(router.calendars.create).toBeDefined();
      expect(router.calendars.update).toBeDefined();
      expect(router.calendars.remove).toBeDefined();
    });
  });
});
