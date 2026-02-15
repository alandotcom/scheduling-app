// Integration tests for location routes
// Tests actual handler logic with database operations

import {
  describe,
  test,
  expect,
  } from "bun:test";
import { call } from "@orpc/server";
import {
  createTestContext,
  createOrg,
  createLocation,
  createCalendar,
  createResource,
  getTestDb,
  setTestOrgContext,
} from "../test-utils/index.js";
import * as locationRoutes from "./locations.js";
import { locations } from "@scheduling/db/schema";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("Location Routes", () => {
  const db = getTestDb() as Database;

  describe("list", () => {
    test("returns empty list when no locations exist", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        locationRoutes.list,
        { limit: 10 },
        { context: ctx },
      );

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    test("returns locations for the org", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createLocation(db, org.id, { name: "Location 1" });
      await createLocation(db, org.id, { name: "Location 2" });

      const result = await call(
        locationRoutes.list,
        { limit: 10 },
        { context: ctx },
      );

      expect(result.items).toHaveLength(2);
      expect(result.items.map((l) => l.name).sort()).toEqual([
        "Location 1",
        "Location 2",
      ]);
      expect(result.hasMore).toBe(false);
    });

    test("supports cursor pagination", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createLocation(db, org.id, { name: "Location 1" });
      await createLocation(db, org.id, { name: "Location 2" });
      await createLocation(db, org.id, { name: "Location 3" });

      const first = await call(
        locationRoutes.list,
        { limit: 2 },
        { context: ctx },
      );

      expect(first.items).toHaveLength(2);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toBeDefined();

      const second = await call(
        locationRoutes.list,
        { limit: 2, cursor: first.nextCursor! },
        { context: ctx },
      );

      expect(second.items).toHaveLength(1);
      expect(second.hasMore).toBe(false);
    });

    test("does not return locations from other orgs (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      await createLocation(db, org1.id, { name: "Org 1 Location" });
      await createLocation(db, org2.id, { name: "Org 2 Location" });

      const result = await call(
        locationRoutes.list,
        { limit: 10 },
        { context: ctx1 },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe("Org 1 Location");
    });

    test("includes relationship counts for calendars and resources", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const countedLocation = await createLocation(db, org.id, {
        name: "Counted Location",
      });
      const zeroLocation = await createLocation(db, org.id, {
        name: "Zero Location",
      });

      await createCalendar(db, org.id, {
        name: "Counted Calendar",
        locationId: countedLocation.id,
      });
      await createResource(db, org.id, {
        name: "Counted Resource",
        locationId: countedLocation.id,
      });
      await createResource(db, org.id, {
        name: "Zero Location Resource",
        locationId: zeroLocation.id,
      });
      await createCalendar(db, org.id, {
        name: "Global Calendar",
      });

      const result = await call(
        locationRoutes.list,
        { limit: 10 },
        { context: ctx },
      );

      const counted = result.items.find(
        (item) => item.id === countedLocation.id,
      );
      const zero = result.items.find((item) => item.id === zeroLocation.id);

      expect(counted?.relationshipCounts.calendars).toBe(1);
      expect(counted?.relationshipCounts.resources).toBe(1);
      expect(zero?.relationshipCounts.calendars).toBe(0);
      expect(zero?.relationshipCounts.resources).toBe(1);
    });
  });

  describe("get", () => {
    test("returns location by id", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const location = await createLocation(db, org.id, {
        name: "Test Location",
        timezone: "America/Chicago",
      });

      const result = await call(
        locationRoutes.get,
        { id: location.id },
        { context: ctx },
      );

      expect(result.id).toBe(location.id);
      expect(result.name).toBe("Test Location");
      expect(result.timezone).toBe("America/Chicago");
    });

    test("throws NOT_FOUND for non-existent location", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          locationRoutes.get,
          { id: "00000000-0000-0000-0000-000000000000" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for location in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const location = await createLocation(db, org2.id, {
        name: "Org 2 Location",
      });

      await expect(
        call(locationRoutes.get, { id: location.id }, { context: ctx1 }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("create", () => {
    test("creates a new location", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        locationRoutes.create,
        { name: "New Location", timezone: "America/Los_Angeles" },
        { context: ctx },
      );

      expect(result).toBeDefined();
      expect(result!.name).toBe("New Location");
      expect(result!.timezone).toBe("America/Los_Angeles");
      expect(result!.orgId).toBe(org.id);

      // Verify in database
      await setTestOrgContext(db, org.id);
      const [dbLocation] = await db.select().from(locations);
      expect(dbLocation!.name).toBe("New Location");
    });

    test("creates location with specified timezone", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        locationRoutes.create,
        { name: "UTC Location", timezone: "UTC" },
        { context: ctx },
      );

      expect(result!.timezone).toBe("UTC");
    });
  });

  describe("update", () => {
    test("updates location name", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const location = await createLocation(db, org.id, {
        name: "Original Name",
      });

      const result = await call(
        locationRoutes.update,
        { id: location.id, data: { name: "Updated Name" } },
        { context: ctx },
      );

      expect(result!.name).toBe("Updated Name");
    });

    test("updates location timezone", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const location = await createLocation(db, org.id, {
        timezone: "America/New_York",
      });

      const result = await call(
        locationRoutes.update,
        { id: location.id, data: { timezone: "America/Chicago" } },
        { context: ctx },
      );

      expect(result!.timezone).toBe("America/Chicago");
    });

    test("throws NOT_FOUND for non-existent location", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          locationRoutes.update,
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

    test("throws NOT_FOUND for location in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const location = await createLocation(db, org2.id, {
        name: "Org 2 Location",
      });

      await expect(
        call(
          locationRoutes.update,
          { id: location.id, data: { name: "Hacked!" } },
          { context: ctx1 },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("remove", () => {
    test("deletes a location", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const location = await createLocation(db, org.id, { name: "To Delete" });

      const result = await call(
        locationRoutes.remove,
        { id: location.id },
        { context: ctx },
      );

      expect(result.success).toBe(true);

      // Verify deleted from database
      await setTestOrgContext(db, org.id);
      const remaining = await db.select().from(locations);
      expect(remaining).toHaveLength(0);
    });

    test("throws NOT_FOUND for non-existent location", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          locationRoutes.remove,
          { id: "00000000-0000-0000-0000-000000000000" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for location in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const location = await createLocation(db, org2.id, {
        name: "Org 2 Location",
      });

      await expect(
        call(locationRoutes.remove, { id: location.id }, { context: ctx1 }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("Module Exports", () => {
    test("location routes module exists and exports correctly", async () => {
      const routes = await import("./locations.js");

      expect(routes.locationRoutes).toBeDefined();
      expect(routes.locationRoutes.list).toBeDefined();
      expect(routes.locationRoutes.get).toBeDefined();
      expect(routes.locationRoutes.create).toBeDefined();
      expect(routes.locationRoutes.update).toBeDefined();
      expect(routes.locationRoutes.remove).toBeDefined();
    });

    test("main router includes location routes", async () => {
      const { router } = await import("./index.js");

      expect(router).toBeDefined();
      expect(router.locations).toBeDefined();
      expect(router.locations.list).toBeDefined();
      expect(router.locations.get).toBeDefined();
      expect(router.locations.create).toBeDefined();
      expect(router.locations.update).toBeDefined();
      expect(router.locations.remove).toBeDefined();
    });
  });
});
