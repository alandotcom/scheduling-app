// Integration tests for client routes
// Tests actual handler logic with database operations

import { describe, test, expect } from "bun:test";
import { call } from "@orpc/server";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import {
  createTestContext,
  createOrg,
  createCalendar,
  createAppointmentType,
  createClient,
  createAppointment,
  getTestDb,
  registerDbTestReset,
  setTestOrgContext,
} from "../test-utils/index.js";
import * as clientRoutes from "./clients.js";
import * as customAttributeRoutes from "./custom-attributes.js";
import { appointments, clients } from "@scheduling/db/schema";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("Client Routes", () => {
  registerDbTestReset("per-file");
  const db = getTestDb() as Database;

  describe("create", () => {
    test("creates a new client", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        clientRoutes.create,
        {
          firstName: "New",
          lastName: "Client",
          email: "new@example.com",
          phone: "+14155555678",
        },
        { context: ctx },
      );

      expect(result).toBeDefined();
      expect(result!.firstName).toBe("New");
      expect(result!.lastName).toBe("Client");
      expect(result!.email).toBe("new@example.com");
      expect(result!.phone).toBe("+14155555678");
      expect(result!.orgId).toBe(org.id);

      // Verify in database
      await setTestOrgContext(db, org.id);
      const [dbClient] = await db.select().from(clients);
      expect(dbClient!.firstName).toBe("New");
    });

    test("creates client without optional fields", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        clientRoutes.create,
        { firstName: "Minimal", lastName: "Client" },
        { context: ctx },
      );

      expect(result!.email).toBeNull();
      expect(result!.phone).toBeNull();
      expect(result!.referenceId).toBeNull();
    });

    test("creates client with reference ID", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        clientRoutes.create,
        {
          firstName: "External",
          lastName: "Ref",
          referenceId: "ext-client-42",
        },
        { context: ctx },
      );

      expect(result.referenceId).toBe("ext-client-42");
    });

    test("normalizes phone to E.164 using default US country", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        clientRoutes.create,
        {
          firstName: "Phone",
          lastName: "Normalize",
          phone: "(415) 555-2671",
        },
        { context: ctx },
      );

      expect(result!.phone).toBe("+14155552671");
    });

    test("normalizes phone to E.164 using provided country", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        clientRoutes.create,
        {
          firstName: "Country",
          lastName: "Code",
          phone: "07890 123456",
          phoneCountry: "GB",
        },
        { context: ctx },
      );

      expect(result!.phone).toBe("+447890123456");
    });

    test("throws BAD_REQUEST for invalid phone format", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          clientRoutes.create,
          {
            firstName: "Bad",
            lastName: "Phone",
            phone: "not-a-phone",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("throws CONFLICT for duplicate email in same org (case-insensitive)", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await call(
        clientRoutes.create,
        {
          firstName: "First",
          lastName: "Client",
          email: "John@Example.com",
        },
        { context: ctx },
      );

      await expect(
        call(
          clientRoutes.create,
          {
            firstName: "Second",
            lastName: "Client",
            email: "john@example.com",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("throws CONFLICT for duplicate normalized phone in same org", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await call(
        clientRoutes.create,
        {
          firstName: "First",
          lastName: "Client",
          phone: "(415) 555-2671",
        },
        { context: ctx },
      );

      await expect(
        call(
          clientRoutes.create,
          {
            firstName: "Second",
            lastName: "Client",
            phone: "+1 415 555 2671",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("throws CONFLICT for duplicate reference ID in same org", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await call(
        clientRoutes.create,
        {
          firstName: "First",
          lastName: "Client",
          referenceId: "ext-duplicate",
        },
        { context: ctx },
      );

      await expect(
        call(
          clientRoutes.create,
          {
            firstName: "Second",
            lastName: "Client",
            referenceId: "ext-duplicate",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("allows same reference ID in different orgs", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2, user: user2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });
      const ctx2 = createTestContext({ orgId: org2.id, userId: user2.id });

      const first = await call(
        clientRoutes.create,
        {
          firstName: "Shared",
          lastName: "Reference",
          referenceId: "ext-shared",
        },
        { context: ctx1 },
      );

      const second = await call(
        clientRoutes.create,
        {
          firstName: "Shared",
          lastName: "Reference",
          referenceId: "ext-shared",
        },
        { context: ctx2 },
      );

      expect(first.orgId).toBe(org1.id);
      expect(second.orgId).toBe(org2.id);
      expect(first.referenceId).toBe("ext-shared");
      expect(second.referenceId).toBe("ext-shared");
    });

    test("allows same email and phone in different orgs", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2, user: user2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });
      const ctx2 = createTestContext({ orgId: org2.id, userId: user2.id });

      const payload = {
        firstName: "Shared",
        lastName: "Contact",
        email: "shared@example.com",
        phone: "(415) 555-2671",
      };

      const first = await call(clientRoutes.create, payload, { context: ctx1 });
      const second = await call(clientRoutes.create, payload, {
        context: ctx2,
      });

      expect(first.orgId).toBe(org1.id);
      expect(second.orgId).toBe(org2.id);
      expect(first.phone).toBe("+14155552671");
      expect(second.phone).toBe("+14155552671");
    });
  });

  describe("update", () => {
    test("updates client email", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "Test",
        lastName: "Client",
        email: "old@example.com",
      });

      const result = await call(
        clientRoutes.update,
        { id: client.id, email: "new@example.com" },
        { context: ctx },
      );

      expect(result!.email).toBe("new@example.com");
    });

    test("updates client phone", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "Test",
        lastName: "Client",
        phone: "+14155550000",
      });

      const result = await call(
        clientRoutes.update,
        { id: client.id, phone: "+14155559999" },
        { context: ctx },
      );

      expect(result!.phone).toBe("+14155559999");
    });

    test("updates client reference ID by client ID", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "Reference",
        lastName: "Update",
      });

      const result = await call(
        clientRoutes.update,
        { id: client.id, referenceId: "ext-updated" },
        { context: ctx },
      );

      expect(result.referenceId).toBe("ext-updated");
    });

    test("clears client reference ID by setting null", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "Reference",
        lastName: "Clear",
        referenceId: "ext-clear",
      });

      const result = await call(
        clientRoutes.update,
        { id: client.id, referenceId: null },
        { context: ctx },
      );

      expect(result.referenceId).toBeNull();
    });

    test("normalizes updated phone to E.164", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "Test",
        lastName: "Client",
      });

      const result = await call(
        clientRoutes.update,
        { id: client.id, phone: "(415) 555-2671" },
        { context: ctx },
      );

      expect(result!.phone).toBe("+14155552671");
    });

    test("throws BAD_REQUEST for invalid phone format", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "Test",
        lastName: "Client",
      });

      await expect(
        call(
          clientRoutes.update,
          { id: client.id, phone: "invalid-phone" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("throws CONFLICT when updating to duplicate email in same org", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const first = await createClient(db, org.id, {
        firstName: "First",
        lastName: "Client",
        email: "first@example.com",
      });
      const second = await createClient(db, org.id, {
        firstName: "Second",
        lastName: "Client",
        email: "second@example.com",
      });

      await expect(
        call(
          clientRoutes.update,
          { id: second.id, email: "FIRST@EXAMPLE.COM" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });

      expect(first.email).toBe("first@example.com");
    });

    test("throws CONFLICT when updating to duplicate normalized phone in same org", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const first = await createClient(db, org.id, {
        firstName: "First",
        lastName: "Client",
        phone: "+14155552671",
      });
      const second = await createClient(db, org.id, {
        firstName: "Second",
        lastName: "Client",
        phone: "+14155552672",
      });

      await expect(
        call(
          clientRoutes.update,
          { id: second.id, phone: "(415) 555-2671" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });

      expect(first.phone).toBe("+14155552671");
    });

    test("throws CONFLICT when updating to duplicate reference ID in same org", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createClient(db, org.id, {
        firstName: "First",
        lastName: "Reference",
        referenceId: "ext-first",
      });
      const second = await createClient(db, org.id, {
        firstName: "Second",
        lastName: "Reference",
        referenceId: "ext-second",
      });

      await expect(
        call(
          clientRoutes.update,
          { id: second.id, referenceId: "ext-first" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("updates client by reference ID and can change reference ID", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "By",
        lastName: "Reference",
        referenceId: "ext-old",
      });

      const updated = await call(
        clientRoutes.updateByReference,
        {
          clientReferenceId: "ext-old",
          firstName: "Updated",
          referenceId: "ext-new",
        },
        { context: ctx },
      );

      expect(updated.id).toBe(client.id);
      expect(updated.firstName).toBe("Updated");
      expect(updated.referenceId).toBe("ext-new");

      await expect(
        call(
          clientRoutes.getByReference,
          { referenceId: "ext-old" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      const fetched = await call(
        clientRoutes.getByReference,
        { referenceId: "ext-new" },
        { context: ctx },
      );
      expect(fetched.id).toBe(client.id);
    });

    test("throws CONFLICT when updateByReference sets duplicate reference ID", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createClient(db, org.id, {
        firstName: "First",
        lastName: "Reference",
        referenceId: "ext-first",
      });
      await createClient(db, org.id, {
        firstName: "Second",
        lastName: "Reference",
        referenceId: "ext-second",
      });

      await expect(
        call(
          clientRoutes.updateByReference,
          {
            clientReferenceId: "ext-second",
            referenceId: "ext-first",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("throws NOT_FOUND when updateByReference target does not exist", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          clientRoutes.updateByReference,
          { clientReferenceId: "missing-reference", firstName: "Nope" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for non-existent client", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          clientRoutes.update,
          {
            id: "00000000-0000-0000-0000-000000000000",
            firstName: "Updated",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for client in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const client = await createClient(db, org2.id, {
        firstName: "Org2",
        lastName: "Client",
      });

      await expect(
        call(
          clientRoutes.update,
          { id: client.id, firstName: "Hacked!" },
          { context: ctx1 },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("remove", () => {
    test("deletes a client", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "To",
        lastName: "Delete",
      });

      const result = await call(
        clientRoutes.remove,
        { id: client.id },
        { context: ctx },
      );

      expect(result.success).toBe(true);

      // Verify deleted from database
      await setTestOrgContext(db, org.id);
      const remaining = await db.select().from(clients);
      expect(remaining).toHaveLength(0);
    });

    test("deletes client appointments when deleting by id", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const calendar = await createCalendar(db, org.id, {
        name: "Cascade Calendar",
      });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Cascade Type",
        calendarIds: [calendar.id],
      });
      const client = await createClient(db, org.id, {
        firstName: "Cascade",
        lastName: "Delete",
      });
      const startAt = DateTime.now().plus({ days: 1 }).toJSDate();
      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: client.id,
        startAt,
        endAt: DateTime.fromJSDate(startAt).plus({ minutes: 30 }).toJSDate(),
        status: "scheduled",
      });

      const result = await call(
        clientRoutes.remove,
        { id: client.id },
        { context: ctx },
      );

      expect(result.success).toBe(true);

      await setTestOrgContext(db, org.id);
      const remainingAppointments = await db
        .select({ id: appointments.id })
        .from(appointments)
        .where(eq(appointments.clientId, client.id));
      expect(remainingAppointments).toHaveLength(0);
    });

    test("throws NOT_FOUND for non-existent client", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          clientRoutes.remove,
          { id: "00000000-0000-0000-0000-000000000000" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for client in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const client = await createClient(db, org2.id, {
        firstName: "Org2",
        lastName: "Client",
      });

      await expect(
        call(clientRoutes.remove, { id: client.id }, { context: ctx1 }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("deletes a client by reference ID", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "ByRef",
        lastName: "Delete",
        referenceId: "ext-delete",
      });
      const calendar = await createCalendar(db, org.id, {
        name: "ByRef Calendar",
      });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "ByRef Type",
        calendarIds: [calendar.id],
      });
      const startAt = DateTime.now().plus({ days: 1 }).toJSDate();
      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: client.id,
        startAt,
        endAt: DateTime.fromJSDate(startAt).plus({ minutes: 30 }).toJSDate(),
        status: "scheduled",
      });

      const result = await call(
        clientRoutes.removeByReference,
        { referenceId: "ext-delete" },
        { context: ctx },
      );

      expect(result.success).toBe(true);

      await expect(
        call(
          clientRoutes.getByReference,
          { referenceId: "ext-delete" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });

      await setTestOrgContext(db, org.id);
      const remainingAppointments = await db
        .select({ id: appointments.id })
        .from(appointments)
        .where(eq(appointments.clientId, client.id));
      expect(remainingAppointments).toHaveLength(0);
    });

    test("throws NOT_FOUND when deleting by missing reference ID", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          clientRoutes.removeByReference,
          { referenceId: "missing-reference" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("custom attributes", () => {
    // Helper to set up definitions for an org
    async function setupDefinitions(ctx: ReturnType<typeof createTestContext>) {
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "color", label: "Color", type: "TEXT" },
        { context: ctx },
      );
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "score", label: "Score", type: "NUMBER" },
        { context: ctx },
      );
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "isVip", label: "VIP", type: "BOOLEAN" },
        { context: ctx },
      );
      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "consultationAt",
          label: "Consultation Date Time",
          type: "DATE_TIME",
        },
        { context: ctx },
      );
      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "status",
          label: "Status",
          type: "SELECT",
          options: ["active", "inactive", "pending"],
        },
        { context: ctx },
      );
      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "tags",
          label: "Tags",
          type: "MULTI_SELECT",
          options: ["vip", "new", "returning"],
        },
        { context: ctx },
      );
    }

    test("create client with custom attributes", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await setupDefinitions(ctx);

      const result = await call(
        clientRoutes.create,
        {
          firstName: "Custom",
          lastName: "Client",
          customAttributes: {
            color: "blue",
            score: 95,
            isVip: true,
            consultationAt: "2026-03-01T15:30:00.000Z",
            status: "active",
            tags: ["vip", "new"],
          },
        },
        { context: ctx },
      );

      expect(result.firstName).toBe("Custom");
      expect(result.customAttributes).toBeDefined();
      expect(result.customAttributes!["color"]).toBe("blue");
      expect(result.customAttributes!["score"]).toBe(95);
      expect(result.customAttributes!["isVip"]).toBe(true);
      expect(result.customAttributes!["consultationAt"]).toBe(
        "2026-03-01T15:30:00.000Z",
      );
      expect(result.customAttributes!["status"]).toBe("active");
      expect(result.customAttributes!["tags"]).toEqual(["vip", "new"]);
    });

    test("create client without custom attributes returns null values for defined fields", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "notes", label: "Notes", type: "TEXT" },
        { context: ctx },
      );

      const result = await call(
        clientRoutes.create,
        { firstName: "No", lastName: "Attrs" },
        { context: ctx },
      );

      expect(result.customAttributes).toBeDefined();
      expect(result.customAttributes!["notes"]).toBeNull();
    });

    test("get client returns custom attributes", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "color", label: "Color", type: "TEXT" },
        { context: ctx },
      );

      const created = await call(
        clientRoutes.create,
        {
          firstName: "Fetch",
          lastName: "Attrs",
          customAttributes: { color: "red" },
        },
        { context: ctx },
      );

      const fetched = await call(
        clientRoutes.get,
        { id: created.id },
        { context: ctx },
      );

      expect(fetched.customAttributes).toBeDefined();
      expect(fetched.customAttributes!["color"]).toBe("red");
    });

    test("get client by reference ID returns custom attributes", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "level", label: "Level", type: "NUMBER" },
        { context: ctx },
      );

      await call(
        clientRoutes.create,
        {
          firstName: "Ref",
          lastName: "Client",
          referenceId: "ext-attrs-1",
          customAttributes: { level: 42 },
        },
        { context: ctx },
      );

      const fetched = await call(
        clientRoutes.getByReference,
        { referenceId: "ext-attrs-1" },
        { context: ctx },
      );

      expect(fetched.customAttributes).toBeDefined();
      expect(fetched.customAttributes!["level"]).toBe(42);
    });

    test("update client with custom attributes", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "color", label: "Color", type: "TEXT" },
        { context: ctx },
      );

      const created = await call(
        clientRoutes.create,
        {
          firstName: "Update",
          lastName: "Attrs",
          customAttributes: { color: "red" },
        },
        { context: ctx },
      );

      const updated = await call(
        clientRoutes.update,
        {
          id: created.id,
          customAttributes: { color: "green" },
        },
        { context: ctx },
      );

      expect(updated.customAttributes!["color"]).toBe("green");
    });

    test("update client custom attributes preserves unmodified values", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "color", label: "Color", type: "TEXT" },
        { context: ctx },
      );
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "size", label: "Size", type: "TEXT" },
        { context: ctx },
      );

      const created = await call(
        clientRoutes.create,
        {
          firstName: "Partial",
          lastName: "Update",
          customAttributes: { color: "red", size: "large" },
        },
        { context: ctx },
      );

      const updated = await call(
        clientRoutes.update,
        {
          id: created.id,
          customAttributes: { color: "blue" },
        },
        { context: ctx },
      );

      expect(updated.customAttributes!["color"]).toBe("blue");
      // size should remain unchanged — upsert only modifies supplied slots
      expect(updated.customAttributes!["size"]).toBe("large");
    });

    test("set custom attribute to null clears the value", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "color", label: "Color", type: "TEXT" },
        { context: ctx },
      );

      const created = await call(
        clientRoutes.create,
        {
          firstName: "Clear",
          lastName: "Value",
          customAttributes: { color: "red" },
        },
        { context: ctx },
      );

      const updated = await call(
        clientRoutes.update,
        {
          id: created.id,
          customAttributes: { color: null },
        },
        { context: ctx },
      );

      expect(updated.customAttributes!["color"]).toBeNull();
    });

    test("throws BAD_REQUEST for unknown custom attribute field key", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "color", label: "Color", type: "TEXT" },
        { context: ctx },
      );

      await expect(
        call(
          clientRoutes.create,
          {
            firstName: "Bad",
            lastName: "Field",
            customAttributes: { unknownField: "value" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("throws BAD_REQUEST for wrong value type (string for NUMBER)", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "score", label: "Score", type: "NUMBER" },
        { context: ctx },
      );

      await expect(
        call(
          clientRoutes.create,
          {
            firstName: "Type",
            lastName: "Error",
            customAttributes: { score: "not-a-number" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("throws BAD_REQUEST for invalid SELECT option", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "status",
          label: "Status",
          type: "SELECT",
          options: ["active", "inactive"],
        },
        { context: ctx },
      );

      await expect(
        call(
          clientRoutes.create,
          {
            firstName: "Bad",
            lastName: "Option",
            customAttributes: { status: "unknown_option" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("throws BAD_REQUEST for invalid MULTI_SELECT option", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "tags",
          label: "Tags",
          type: "MULTI_SELECT",
          options: ["vip", "new"],
        },
        { context: ctx },
      );

      await expect(
        call(
          clientRoutes.create,
          {
            firstName: "Bad",
            lastName: "Multi",
            customAttributes: { tags: ["vip", "invalid_tag"] },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("throws BAD_REQUEST for invalid DATE_TIME value", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "consultationAt",
          label: "Consultation Date Time",
          type: "DATE_TIME",
        },
        { context: ctx },
      );

      await expect(
        call(
          clientRoutes.create,
          {
            firstName: "Bad",
            lastName: "DateTime",
            customAttributes: { consultationAt: "not-a-date" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("throws BAD_REQUEST for DATE_TIME value without time component", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "consultationAt",
          label: "Consultation Date Time",
          type: "DATE_TIME",
        },
        { context: ctx },
      );

      await expect(
        call(
          clientRoutes.create,
          {
            firstName: "Bad",
            lastName: "DateOnly",
            customAttributes: { consultationAt: "2026-03-01" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("throws BAD_REQUEST for MULTI_SELECT with non-array value", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "tags",
          label: "Tags",
          type: "MULTI_SELECT",
          options: ["a", "b"],
        },
        { context: ctx },
      );

      await expect(
        call(
          clientRoutes.create,
          {
            firstName: "Bad",
            lastName: "Multi",
            customAttributes: { tags: "not-an-array" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("required custom attribute enforced on client create", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "requiredField",
          label: "Required",
          type: "TEXT",
          required: true,
        },
        { context: ctx },
      );

      // Creating with required field succeeds
      const success = await call(
        clientRoutes.create,
        {
          firstName: "With",
          lastName: "Required",
          customAttributes: { requiredField: "present" },
        },
        { context: ctx },
      );
      expect(success.customAttributes!["requiredField"]).toBe("present");

      // Creating with required field as null fails
      await expect(
        call(
          clientRoutes.create,
          {
            firstName: "No",
            lastName: "Required",
            customAttributes: { requiredField: null },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("required custom attribute allows null in update if not included", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "requiredField",
          label: "Required",
          type: "TEXT",
          required: true,
        },
        { context: ctx },
      );
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "optionalField", label: "Optional", type: "TEXT" },
        { context: ctx },
      );

      const created = await call(
        clientRoutes.create,
        {
          firstName: "Update",
          lastName: "Required",
          customAttributes: { requiredField: "value" },
        },
        { context: ctx },
      );

      // Updating optionalField without touching requiredField should succeed
      const updated = await call(
        clientRoutes.update,
        {
          id: created.id,
          customAttributes: { optionalField: "added" },
        },
        { context: ctx },
      );

      expect(updated.customAttributes!["requiredField"]).toBe("value");
      expect(updated.customAttributes!["optionalField"]).toBe("added");
    });

    test("required custom attribute rejects explicit null in update", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "requiredField",
          label: "Required",
          type: "TEXT",
          required: true,
        },
        { context: ctx },
      );

      const created = await call(
        clientRoutes.create,
        {
          firstName: "Null",
          lastName: "Required",
          customAttributes: { requiredField: "value" },
        },
        { context: ctx },
      );

      await expect(
        call(
          clientRoutes.update,
          {
            id: created.id,
            customAttributes: { requiredField: null },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("update client by reference ID with custom attributes", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await call(
        customAttributeRoutes.createDefinition,
        { fieldKey: "tier", label: "Tier", type: "TEXT" },
        { context: ctx },
      );

      await call(
        clientRoutes.create,
        {
          firstName: "ByRef",
          lastName: "Update",
          referenceId: "ext-ca-update",
          customAttributes: { tier: "basic" },
        },
        { context: ctx },
      );

      const updated = await call(
        clientRoutes.updateByReference,
        {
          clientReferenceId: "ext-ca-update",
          customAttributes: { tier: "premium" },
        },
        { context: ctx },
      );

      expect(updated.customAttributes!["tier"]).toBe("premium");
    });

    test("client with no defined custom attributes returns empty object", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      // No definitions created for this org
      const created = await call(
        clientRoutes.create,
        { firstName: "No", lastName: "Defs" },
        { context: ctx },
      );

      const fetched = await call(
        clientRoutes.get,
        { id: created.id },
        { context: ctx },
      );

      expect(fetched.customAttributes).toEqual({});
    });

    test("throws BAD_REQUEST when setting custom attributes with no definitions", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      // No definitions created — trying to set values should fail
      await expect(
        call(
          clientRoutes.create,
          {
            firstName: "No",
            lastName: "Defs",
            customAttributes: { field: "value" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("relation custom attributes sync bidirectionally when paired", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "referredBy",
          label: "Referred By",
          type: "RELATION_CLIENT",
          relationConfig: {
            valueMode: "single",
          },
          reverseRelation: {
            fieldKey: "referrals",
            label: "Referrals",
            valueMode: "multi",
          },
        },
        { context: ctx },
      );

      const alice = await call(
        clientRoutes.create,
        {
          firstName: "Alice",
          lastName: "Client",
        },
        { context: ctx },
      );
      const bob = await call(
        clientRoutes.create,
        {
          firstName: "Bob",
          lastName: "Client",
        },
        { context: ctx },
      );

      await call(
        clientRoutes.update,
        {
          id: alice.id,
          customAttributes: { referredBy: bob.id },
        },
        { context: ctx },
      );

      const updatedAlice = await call(
        clientRoutes.get,
        { id: alice.id },
        { context: ctx },
      );
      const updatedBob = await call(
        clientRoutes.get,
        { id: bob.id },
        { context: ctx },
      );

      expect(updatedAlice.customAttributes?.["referredBy"]).toBe(bob.id);
      expect(updatedBob.customAttributes?.["referrals"]).toEqual([alice.id]);
    });

    test("relation custom attributes remove stale reverse links when replaced", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "referredBy",
          label: "Referred By",
          type: "RELATION_CLIENT",
          relationConfig: {
            valueMode: "single",
          },
          reverseRelation: {
            fieldKey: "referrals",
            label: "Referrals",
            valueMode: "multi",
          },
        },
        { context: ctx },
      );

      const alice = await call(
        clientRoutes.create,
        {
          firstName: "Alice",
          lastName: "Client",
        },
        { context: ctx },
      );
      const bob = await call(
        clientRoutes.create,
        {
          firstName: "Bob",
          lastName: "Client",
        },
        { context: ctx },
      );
      const charlie = await call(
        clientRoutes.create,
        {
          firstName: "Charlie",
          lastName: "Client",
        },
        { context: ctx },
      );

      await call(
        clientRoutes.update,
        {
          id: alice.id,
          customAttributes: { referredBy: bob.id },
        },
        { context: ctx },
      );

      await call(
        clientRoutes.update,
        {
          id: alice.id,
          customAttributes: { referredBy: charlie.id },
        },
        { context: ctx },
      );

      const updatedBob = await call(
        clientRoutes.get,
        { id: bob.id },
        { context: ctx },
      );
      const updatedCharlie = await call(
        clientRoutes.get,
        { id: charlie.id },
        { context: ctx },
      );

      expect(updatedBob.customAttributes?.["referrals"]).toBeNull();
      expect(updatedCharlie.customAttributes?.["referrals"]).toEqual([
        alice.id,
      ]);
    });

    test("relation custom attributes reject self-links", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "referredBy",
          label: "Referred By",
          type: "RELATION_CLIENT",
          relationConfig: {
            valueMode: "single",
          },
        },
        { context: ctx },
      );

      const alice = await call(
        clientRoutes.create,
        {
          firstName: "Alice",
          lastName: "Client",
        },
        { context: ctx },
      );

      await expect(
        call(
          clientRoutes.update,
          {
            id: alice.id,
            customAttributes: { referredBy: alice.id },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("relation custom attributes reject unknown target client IDs", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "referredBy",
          label: "Referred By",
          type: "RELATION_CLIENT",
          relationConfig: {
            valueMode: "single",
          },
        },
        { context: ctx },
      );

      const alice = await call(
        clientRoutes.create,
        {
          firstName: "Alice",
          lastName: "Client",
        },
        { context: ctx },
      );

      await expect(
        call(
          clientRoutes.update,
          {
            id: alice.id,
            customAttributes: {
              referredBy: "00000000-0000-7000-8000-000000000099",
            },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("relation custom attributes reject multiple targets in single mode", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "referredBy",
          label: "Referred By",
          type: "RELATION_CLIENT",
          relationConfig: {
            valueMode: "single",
          },
        },
        { context: ctx },
      );

      const alice = await call(
        clientRoutes.create,
        {
          firstName: "Alice",
          lastName: "Client",
        },
        { context: ctx },
      );
      const bob = await call(
        clientRoutes.create,
        {
          firstName: "Bob",
          lastName: "Client",
        },
        { context: ctx },
      );
      const charlie = await call(
        clientRoutes.create,
        {
          firstName: "Charlie",
          lastName: "Client",
        },
        { context: ctx },
      );

      await expect(
        call(
          clientRoutes.update,
          {
            id: alice.id,
            customAttributes: { referredBy: [bob.id, charlie.id] },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    test("single-single paired relations displace previous reverse links", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "referredBy",
          label: "Referred By",
          type: "RELATION_CLIENT",
          relationConfig: {
            valueMode: "single",
          },
          reverseRelation: {
            fieldKey: "currentReferral",
            label: "Current Referral",
            valueMode: "single",
          },
        },
        { context: ctx },
      );

      const alice = await call(
        clientRoutes.create,
        {
          firstName: "Alice",
          lastName: "Client",
        },
        { context: ctx },
      );
      const bob = await call(
        clientRoutes.create,
        {
          firstName: "Bob",
          lastName: "Client",
        },
        { context: ctx },
      );
      const charlie = await call(
        clientRoutes.create,
        {
          firstName: "Charlie",
          lastName: "Client",
        },
        { context: ctx },
      );

      await call(
        clientRoutes.update,
        {
          id: alice.id,
          customAttributes: { referredBy: bob.id },
        },
        { context: ctx },
      );

      await call(
        clientRoutes.update,
        {
          id: charlie.id,
          customAttributes: { referredBy: bob.id },
        },
        { context: ctx },
      );

      const updatedAlice = await call(
        clientRoutes.get,
        { id: alice.id },
        { context: ctx },
      );
      const updatedBob = await call(
        clientRoutes.get,
        { id: bob.id },
        { context: ctx },
      );
      const updatedCharlie = await call(
        clientRoutes.get,
        { id: charlie.id },
        { context: ctx },
      );

      expect(updatedAlice.customAttributes?.["referredBy"]).toBeNull();
      expect(updatedBob.customAttributes?.["currentReferral"]).toBe(charlie.id);
      expect(updatedCharlie.customAttributes?.["referredBy"]).toBe(bob.id);
    });

    test("relation custom attributes reject malformed target IDs", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await call(
        customAttributeRoutes.createDefinition,
        {
          fieldKey: "referredBy",
          label: "Referred By",
          type: "RELATION_CLIENT",
          relationConfig: {
            valueMode: "single",
          },
        },
        { context: ctx },
      );

      const alice = await call(
        clientRoutes.create,
        {
          firstName: "Alice",
          lastName: "Client",
        },
        { context: ctx },
      );

      await expect(
        call(
          clientRoutes.update,
          {
            id: alice.id,
            customAttributes: { referredBy: "not-a-uuid" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });
  });
});
