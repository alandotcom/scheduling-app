// Integration tests for resource routes
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
  createResource,
  createTestDb,
  resetTestDb,
  closeTestDb,
  setTestOrgContext,
} from "../test-utils/index.js";
import * as resourceRoutes from "./resources.js";
import { resources } from "@scheduling/db/schema";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("Resource Routes", () => {
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
    test("returns empty list when no resources exist", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        resourceRoutes.list,
        { limit: 10 },
        { context: ctx },
      );

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    test("returns resources for the org", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createResource(db, org.id, { name: "Resource 1", quantity: 1 });
      await createResource(db, org.id, { name: "Resource 2", quantity: 5 });

      const result = await call(
        resourceRoutes.list,
        { limit: 10 },
        { context: ctx },
      );

      expect(result.items).toHaveLength(2);
      expect(result.items.map((r) => r.name).sort()).toEqual([
        "Resource 1",
        "Resource 2",
      ]);
      expect(result.hasMore).toBe(false);
    });

    test("supports cursor pagination", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createResource(db, org.id, { name: "Resource 1" });
      await createResource(db, org.id, { name: "Resource 2" });
      await createResource(db, org.id, { name: "Resource 3" });

      const first = await call(
        resourceRoutes.list,
        { limit: 2 },
        { context: ctx },
      );

      expect(first.items).toHaveLength(2);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toBeDefined();

      const second = await call(
        resourceRoutes.list,
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

      await createResource(db, org.id, { name: "Global Resource" });
      await createResource(db, org.id, {
        name: "Location Resource",
        locationId: location.id,
      });

      const result = await call(
        resourceRoutes.list,
        { limit: 10, locationId: location.id },
        { context: ctx },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe("Location Resource");
    });

    test("does not return resources from other orgs (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      await createResource(db, org1.id, { name: "Org 1 Resource" });
      await createResource(db, org2.id, { name: "Org 2 Resource" });

      const result = await call(
        resourceRoutes.list,
        { limit: 10 },
        { context: ctx1 },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe("Org 1 Resource");
    });
  });

  describe("get", () => {
    test("returns resource by id", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const resource = await createResource(db, org.id, {
        name: "Test Resource",
        quantity: 3,
      });

      const result = await call(
        resourceRoutes.get,
        { id: resource.id },
        { context: ctx },
      );

      expect(result.id).toBe(resource.id);
      expect(result.name).toBe("Test Resource");
      expect(result.quantity).toBe(3);
    });

    test("throws NOT_FOUND for non-existent resource", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          resourceRoutes.get,
          { id: "00000000-0000-0000-0000-000000000000" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for resource in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const resource = await createResource(db, org2.id, {
        name: "Org 2 Resource",
      });

      await expect(
        call(resourceRoutes.get, { id: resource.id }, { context: ctx1 }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("create", () => {
    test("creates a new resource", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        resourceRoutes.create,
        { name: "New Resource", quantity: 5 },
        { context: ctx },
      );

      expect(result).toBeDefined();
      expect(result!.name).toBe("New Resource");
      expect(result!.quantity).toBe(5);
      expect(result!.orgId).toBe(org.id);

      // Verify in database
      await setTestOrgContext(db, org.id);
      const [dbResource] = await db.select().from(resources);
      expect(dbResource!.name).toBe("New Resource");
    });

    test("creates resource with location", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const location = await createLocation(db, org.id, {
        name: "Test Location",
      });

      const result = await call(
        resourceRoutes.create,
        { name: "Location Resource", quantity: 1, locationId: location.id },
        { context: ctx },
      );

      expect(result!.locationId).toBe(location.id);
    });

    test("throws NOT_FOUND for non-existent location", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          resourceRoutes.create,
          {
            name: "Bad Resource",
            quantity: 1,
            locationId: "00000000-0000-0000-0000-000000000000",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("uses default quantity if not provided", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        resourceRoutes.create,
        { name: "Default Qty Resource" },
        { context: ctx },
      );

      expect(result!.quantity).toBe(1);
    });
  });

  describe("update", () => {
    test("updates resource name", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const resource = await createResource(db, org.id, {
        name: "Original Name",
      });

      const result = await call(
        resourceRoutes.update,
        { id: resource.id, data: { name: "Updated Name" } },
        { context: ctx },
      );

      expect(result!.name).toBe("Updated Name");
    });

    test("updates resource quantity", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const resource = await createResource(db, org.id, { quantity: 1 });

      const result = await call(
        resourceRoutes.update,
        { id: resource.id, data: { quantity: 10 } },
        { context: ctx },
      );

      expect(result!.quantity).toBe(10);
    });

    test("updates resource location", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const resource = await createResource(db, org.id, { name: "Resource" });
      const location = await createLocation(db, org.id, {
        name: "New Location",
      });

      const result = await call(
        resourceRoutes.update,
        { id: resource.id, data: { locationId: location.id } },
        { context: ctx },
      );

      expect(result!.locationId).toBe(location.id);
    });

    test("throws NOT_FOUND for non-existent resource", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          resourceRoutes.update,
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
      const resource = await createResource(db, org.id, { name: "Resource" });

      await expect(
        call(
          resourceRoutes.update,
          {
            id: resource.id,
            data: { locationId: "00000000-0000-0000-0000-000000000000" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for resource in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const resource = await createResource(db, org2.id, {
        name: "Org 2 Resource",
      });

      await expect(
        call(
          resourceRoutes.update,
          { id: resource.id, data: { name: "Hacked!" } },
          { context: ctx1 },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("remove", () => {
    test("deletes a resource", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const resource = await createResource(db, org.id, { name: "To Delete" });

      const result = await call(
        resourceRoutes.remove,
        { id: resource.id },
        { context: ctx },
      );

      expect(result.success).toBe(true);

      // Verify deleted from database
      await setTestOrgContext(db, org.id);
      const remaining = await db.select().from(resources);
      expect(remaining).toHaveLength(0);
    });

    test("throws NOT_FOUND for non-existent resource", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          resourceRoutes.remove,
          { id: "00000000-0000-0000-0000-000000000000" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for resource in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const resource = await createResource(db, org2.id, {
        name: "Org 2 Resource",
      });

      await expect(
        call(resourceRoutes.remove, { id: resource.id }, { context: ctx1 }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("Module Exports", () => {
    test("resource routes module exists and exports correctly", async () => {
      const routes = await import("./resources.js");

      expect(routes.resourceRoutes).toBeDefined();
      expect(routes.resourceRoutes.list).toBeDefined();
      expect(routes.resourceRoutes.get).toBeDefined();
      expect(routes.resourceRoutes.create).toBeDefined();
      expect(routes.resourceRoutes.update).toBeDefined();
      expect(routes.resourceRoutes.remove).toBeDefined();
    });

    test("main router includes resource routes", async () => {
      const { router } = await import("./index.js");

      expect(router).toBeDefined();
      expect(router.resources).toBeDefined();
      expect(router.resources.list).toBeDefined();
      expect(router.resources.get).toBeDefined();
      expect(router.resources.create).toBeDefined();
      expect(router.resources.update).toBeDefined();
      expect(router.resources.remove).toBeDefined();
    });
  });
});
