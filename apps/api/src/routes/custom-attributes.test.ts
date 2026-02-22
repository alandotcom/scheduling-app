// Integration tests for custom attribute routes
// Tests definition CRUD, slot allocation, and slot usage reporting

import { describe, test, expect } from "bun:test";
import { call } from "@orpc/server";
import {
  createTestContext,
  createOrg,
  getTestDb,
  registerDbTestReset,
} from "../test-utils/index.js";
import * as customAttributeRoutes from "./custom-attributes.js";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("Custom Attribute Routes", () => {
  registerDbTestReset("per-file");
  const db = getTestDb() as Database;

  describe("listDefinitions", () => {
    test("returns empty list when no definitions exist", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        customAttributeRoutes.listDefinitions,
        {},
        {
          context: ctx,
        },
      );

      expect(result).toEqual([]);
    });

    test("returns definitions for the org", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "color", label: "Color", type: "TEXT" },
        { context: ctx },
      );
      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "priority",
          label: "Priority",
          type: "SELECT",
          options: ["low", "high"],
        },
        { context: ctx },
      );

      const result = await call(
        customAttributeRoutes.listDefinitions,
        {},
        {
          context: ctx,
        },
      );

      expect(result).toHaveLength(2);
      expect(result.map((d) => d.fieldKey).sort()).toEqual([
        "color",
        "priority",
      ]);
    });

    test("does not return definitions from other orgs (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, {
        name: "Org 1",
      });
      const { org: org2, user: user2 } = await createOrg(db, {
        name: "Org 2",
      });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });
      const ctx2 = createTestContext({ orgId: org2.id, userId: user2.id });

      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "org1Field", label: "Org1 Field", type: "TEXT" },
        { context: ctx1 },
      );
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "org2Field", label: "Org2 Field", type: "TEXT" },
        { context: ctx2 },
      );

      const result1 = await call(
        customAttributeRoutes.listDefinitions,
        {},
        {
          context: ctx1,
        },
      );
      expect(result1).toHaveLength(1);
      expect(result1[0]!.fieldKey).toBe("org1Field");
    });
  });

  describe("createDefinition", () => {
    test("creates a TEXT definition", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "notes", label: "Notes", type: "TEXT" },
        { context: ctx },
      );

      expect(result.fieldKey).toBe("notes");
      expect(result.label).toBe("Notes");
      expect(result.type).toBe("TEXT");
      expect(result.required).toBe(false);
    });

    test("creates a NUMBER definition", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "score", label: "Score", type: "NUMBER" },
        { context: ctx },
      );

      expect(result.type).toBe("NUMBER");
    });

    test("creates a BOOLEAN definition", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "active", label: "Active", type: "BOOLEAN" },
        { context: ctx },
      );

      expect(result.type).toBe("BOOLEAN");
    });

    test("creates a DATE definition", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "birthDate", label: "Birth Date", type: "DATE" },
        { context: ctx },
      );

      expect(result.type).toBe("DATE");
    });

    test("creates a SELECT definition with options", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "status",
          label: "Status",
          type: "SELECT",
          options: ["active", "inactive", "pending"],
        },
        { context: ctx },
      );

      expect(result.type).toBe("SELECT");
      expect(result.options).toEqual(["active", "inactive", "pending"]);
    });

    test("creates a MULTI_SELECT definition with options", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "tags",
          label: "Tags",
          type: "MULTI_SELECT",
          options: ["vip", "new", "returning"],
        },
        { context: ctx },
      );

      expect(result.type).toBe("MULTI_SELECT");
    });

    test("creates definition with required flag", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "requiredField",
          label: "Required",
          type: "TEXT",
          required: true,
        },
        { context: ctx },
      );

      expect(result.required).toBe(true);
    });

    test("throws CONFLICT for duplicate fieldKey", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "myField", label: "My Field", type: "TEXT" },
        { context: ctx },
      );

      await expect(
        call(
          customAttributeRoutes.createDefinition,
          { fieldKey: "myField", label: "Duplicate", type: "TEXT" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("allows same fieldKey in different orgs", async () => {
      const { org: org1, user: user1 } = await createOrg(db, {
        name: "Org 1",
      });
      const { org: org2, user: user2 } = await createOrg(db, {
        name: "Org 2",
      });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });
      const ctx2 = createTestContext({ orgId: org2.id, userId: user2.id });

      const result1 = await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "sharedKey", label: "Shared", type: "TEXT" },
        { context: ctx1 },
      );
      const result2 = await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "sharedKey", label: "Shared", type: "NUMBER" },
        { context: ctx2 },
      );

      expect(result1.fieldKey).toBe("sharedKey");
      expect(result2.fieldKey).toBe("sharedKey");
      expect(result1.orgId).toBe(org1.id);
      expect(result2.orgId).toBe(org2.id);
    });

    test("allocates different slots for same-prefix types", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const text1 = await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "field1", label: "Field 1", type: "TEXT" },
        { context: ctx },
      );
      const text2 = await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "field2", label: "Field 2", type: "TEXT" },
        { context: ctx },
      );

      expect(text1.id).not.toBe(text2.id);
      expect(text1.fieldKey).toBe("field1");
      expect(text2.fieldKey).toBe("field2");
    });

    test("throws UNPROCESSABLE_CONTENT when all slots of a type are exhausted", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      // JSONB slots have the fewest (2 slots: j0, j1)
      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "multi1",
          label: "Multi 1",
          type: "MULTI_SELECT",
          options: ["a"],
        },
        { context: ctx },
      );
      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "multi2",
          label: "Multi 2",
          type: "MULTI_SELECT",
          options: ["b"],
        },
        { context: ctx },
      );

      await expect(
        call(
          customAttributeRoutes.createDefinition,
          {
            fieldKey: "multi3",
            label: "Multi 3",
            type: "MULTI_SELECT",
            options: ["c"],
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "UNPROCESSABLE_CONTENT",
      });
    });
  });

  describe("updateDefinition", () => {
    test("updates label", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const created = await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "myField", label: "Old Label", type: "TEXT" },
        { context: ctx },
      );

      const result = await call(
        customAttributeRoutes.updateDefinition,
        { id: created.id, label: "New Label" },
        { context: ctx },
      );

      expect(result.label).toBe("New Label");
      expect(result.fieldKey).toBe("myField");
    });

    test("updates required flag", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const created = await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "myField", label: "Field", type: "TEXT" },
        { context: ctx },
      );

      const result = await call(
        customAttributeRoutes.updateDefinition,
        { id: created.id, required: true },
        { context: ctx },
      );

      expect(result.required).toBe(true);
    });

    test("updates options for SELECT type", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const created = await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "status",
          label: "Status",
          type: "SELECT",
          options: ["a", "b"],
        },
        { context: ctx },
      );

      const result = await call(
        customAttributeRoutes.updateDefinition,
        { id: created.id, options: ["a", "b", "c"] },
        { context: ctx },
      );

      expect(result.options).toEqual(["a", "b", "c"]);
    });

    test("throws NOT_FOUND for non-existent definition", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          customAttributeRoutes.updateDefinition,
          {
            id: "00000000-0000-0000-0000-000000000000",
            label: "Updated",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for definition in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, {
        name: "Org 1",
      });
      const { org: org2, user: user2 } = await createOrg(db, {
        name: "Org 2",
      });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });
      const ctx2 = createTestContext({ orgId: org2.id, userId: user2.id });

      const created = await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "field", label: "Field", type: "TEXT" },
        { context: ctx1 },
      );

      await expect(
        call(
          customAttributeRoutes.updateDefinition,
          { id: created.id, label: "Hacked" },
          { context: ctx2 },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("deleteDefinition", () => {
    test("deletes an existing definition", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const created = await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "toDelete", label: "Delete Me", type: "TEXT" },
        { context: ctx },
      );

      const result = await call(
        customAttributeRoutes.deleteDefinition,
        { id: created.id },
        { context: ctx },
      );

      expect(result.success).toBe(true);

      // Verify it's gone
      const list = await call(
        customAttributeRoutes.listDefinitions,
        {},
        {
          context: ctx,
        },
      );
      expect(list).toHaveLength(0);
    });

    test("freed slot is re-usable after deletion", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      // Fill both MULTI_SELECT slots
      const first = await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "multi1",
          label: "Multi 1",
          type: "MULTI_SELECT",
          options: ["a"],
        },
        { context: ctx },
      );
      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "multi2",
          label: "Multi 2",
          type: "MULTI_SELECT",
          options: ["b"],
        },
        { context: ctx },
      );

      // Delete the first one
      await call(
        customAttributeRoutes.deleteDefinition,
        { id: first.id },
        { context: ctx },
      );

      // Now creating a new MULTI_SELECT should succeed (freed slot is reused)
      const reused = await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "multi3",
          label: "Multi 3",
          type: "MULTI_SELECT",
          options: ["c"],
        },
        { context: ctx },
      );

      expect(reused.fieldKey).toBe("multi3");
    });

    test("throws NOT_FOUND for non-existent definition", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          customAttributeRoutes.deleteDefinition,
          { id: "00000000-0000-0000-0000-000000000000" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("getSlotUsage", () => {
    test("returns zero usage when no definitions exist", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        customAttributeRoutes.getSlotUsage,
        {},
        {
          context: ctx,
        },
      );

      expect(result.t).toEqual({ used: 0, total: 10 });
      expect(result.n).toEqual({ used: 0, total: 5 });
      expect(result.d).toEqual({ used: 0, total: 3 });
      expect(result.b).toEqual({ used: 0, total: 5 });
      expect(result.j).toEqual({ used: 0, total: 2 });
    });

    test("reflects created definitions in usage counts", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "text1", label: "Text 1", type: "TEXT" },
        { context: ctx },
      );
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "text2", label: "Text 2", type: "TEXT" },
        { context: ctx },
      );
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "num1", label: "Num 1", type: "NUMBER" },
        { context: ctx },
      );
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "bool1", label: "Bool 1", type: "BOOLEAN" },
        { context: ctx },
      );

      const result = await call(
        customAttributeRoutes.getSlotUsage,
        {},
        {
          context: ctx,
        },
      );

      // TEXT and SELECT share the t prefix
      expect(result.t).toEqual({ used: 2, total: 10 });
      expect(result.n).toEqual({ used: 1, total: 5 });
      expect(result.b).toEqual({ used: 1, total: 5 });
      expect(result.d).toEqual({ used: 0, total: 3 });
      expect(result.j).toEqual({ used: 0, total: 2 });
    });

    test("decrements usage after deletion", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const created = await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "temp", label: "Temp", type: "TEXT" },
        { context: ctx },
      );

      let usage = await call(
        customAttributeRoutes.getSlotUsage,
        {},
        {
          context: ctx,
        },
      );
      expect(usage.t.used).toBe(1);

      await call(
        customAttributeRoutes.deleteDefinition,
        { id: created.id },
        { context: ctx },
      );

      usage = await call(
        customAttributeRoutes.getSlotUsage,
        {},
        {
          context: ctx,
        },
      );
      expect(usage.t.used).toBe(0);
    });

    test("SELECT definitions count toward text slot usage", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "selectField",
          label: "Select",
          type: "SELECT",
          options: ["a", "b"],
        },
        { context: ctx },
      );

      const result = await call(
        customAttributeRoutes.getSlotUsage,
        {},
        {
          context: ctx,
        },
      );

      expect(result.t.used).toBe(1);
    });
  });

  describe("Module Exports", () => {
    test("custom attribute routes module exports correctly", async () => {
      const routes = await import("./custom-attributes.js");

      expect(routes.customAttributeRoutes).toBeDefined();
      expect(routes.customAttributeRoutes.listDefinitions).toBeDefined();
      expect(routes.customAttributeRoutes.createDefinition).toBeDefined();
      expect(routes.customAttributeRoutes.updateDefinition).toBeDefined();
      expect(routes.customAttributeRoutes.deleteDefinition).toBeDefined();
      expect(routes.customAttributeRoutes.getSlotUsage).toBeDefined();
    });

    test("main router includes custom attribute routes", async () => {
      const { router } = await import("./index.js");

      expect(router).toBeDefined();
      expect(router.customAttributes).toBeDefined();
      expect(router.customAttributes.listDefinitions).toBeDefined();
      expect(router.customAttributes.createDefinition).toBeDefined();
      expect(router.customAttributes.getSlotUsage).toBeDefined();
      expect(router.customAttributes.updateDefinition).toBeDefined();
      expect(router.customAttributes.deleteDefinition).toBeDefined();
    });
  });
});
