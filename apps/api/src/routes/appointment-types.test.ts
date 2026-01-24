// Integration tests for appointment type routes
// Tests actual handler logic with database operations including calendar and resource associations

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { call } from "@orpc/server";
import {
  createTestContext,
  createOrg,
  createCalendar,
  createResource,
  createAppointmentType,
  createTestDb,
  resetTestDb,
  closeTestDb,
  setTestOrgContext,
} from "../test-utils/index.js";
import * as appointmentTypeRoutes from "./appointment-types.js";
import { appointmentTypes } from "@scheduling/db/schema";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql";
import type * as schema from "@scheduling/db/schema";

type Database = BunSQLDatabase<typeof schema>;

describe("Appointment Type Routes", () => {
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
    test("returns empty list when no appointment types exist", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        appointmentTypeRoutes.list,
        { limit: 10 },
        { context: ctx },
      );

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    test("returns appointment types for the org", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createAppointmentType(db, org.id, { name: "Consultation" });
      await createAppointmentType(db, org.id, { name: "Follow-up" });

      const result = await call(
        appointmentTypeRoutes.list,
        { limit: 10 },
        { context: ctx },
      );

      expect(result.items).toHaveLength(2);
      expect(result.items.map((a) => a.name).sort()).toEqual([
        "Consultation",
        "Follow-up",
      ]);
      expect(result.hasMore).toBe(false);
    });

    test("supports cursor pagination", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createAppointmentType(db, org.id, { name: "Type 1" });
      await createAppointmentType(db, org.id, { name: "Type 2" });
      await createAppointmentType(db, org.id, { name: "Type 3" });

      const first = await call(
        appointmentTypeRoutes.list,
        { limit: 2 },
        { context: ctx },
      );

      expect(first.items).toHaveLength(2);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toBeDefined();

      const second = await call(
        appointmentTypeRoutes.list,
        { limit: 2, cursor: first.nextCursor! },
        { context: ctx },
      );

      expect(second.items).toHaveLength(1);
      expect(second.hasMore).toBe(false);
    });

    test("does not return appointment types from other orgs (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      await createAppointmentType(db, org1.id, { name: "Org 1 Type" });
      await createAppointmentType(db, org2.id, { name: "Org 2 Type" });

      const result = await call(
        appointmentTypeRoutes.list,
        { limit: 10 },
        { context: ctx1 },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.name).toBe("Org 1 Type");
    });
  });

  describe("get", () => {
    test("returns appointment type by id", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Test Type",
        durationMin: 45,
      });

      const result = await call(
        appointmentTypeRoutes.get,
        { id: appointmentType.id },
        { context: ctx },
      );

      expect(result.id).toBe(appointmentType.id);
      expect(result.name).toBe("Test Type");
      expect(result.durationMin).toBe(45);
    });

    test("throws NOT_FOUND for non-existent appointment type", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          appointmentTypeRoutes.get,
          { id: "00000000-0000-0000-0000-000000000000" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for appointment type in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const appointmentType = await createAppointmentType(db, org2.id, {
        name: "Org 2 Type",
      });

      await expect(
        call(
          appointmentTypeRoutes.get,
          { id: appointmentType.id },
          { context: ctx1 },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("create", () => {
    test("creates a new appointment type", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        appointmentTypeRoutes.create,
        { name: "New Type", durationMin: 30 },
        { context: ctx },
      );

      expect(result).toBeDefined();
      expect(result!.name).toBe("New Type");
      expect(result!.durationMin).toBe(30);
      expect(result!.orgId).toBe(org.id);

      // Verify in database
      await setTestOrgContext(db, org.id);
      const [dbType] = await db.select().from(appointmentTypes);
      expect(dbType!.name).toBe("New Type");
    });

    test("creates appointment type with padding", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        appointmentTypeRoutes.create,
        {
          name: "Padded Type",
          durationMin: 60,
          paddingBeforeMin: 15,
          paddingAfterMin: 10,
        },
        { context: ctx },
      );

      expect(result!.paddingBeforeMin).toBe(15);
      expect(result!.paddingAfterMin).toBe(10);
    });

    test("creates appointment type with capacity", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        appointmentTypeRoutes.create,
        {
          name: "Group Session",
          durationMin: 90,
          capacity: 10,
        },
        { context: ctx },
      );

      expect(result!.capacity).toBe(10);
    });
  });

  describe("update", () => {
    test("updates appointment type name", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Original Name",
      });

      const result = await call(
        appointmentTypeRoutes.update,
        { id: appointmentType.id, data: { name: "Updated Name" } },
        { context: ctx },
      );

      expect(result!.name).toBe("Updated Name");
    });

    test("updates appointment type duration", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const appointmentType = await createAppointmentType(db, org.id, {
        durationMin: 30,
      });

      const result = await call(
        appointmentTypeRoutes.update,
        { id: appointmentType.id, data: { durationMin: 60 } },
        { context: ctx },
      );

      expect(result!.durationMin).toBe(60);
    });

    test("updates appointment type padding", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const appointmentType = await createAppointmentType(db, org.id, {
        paddingBeforeMin: 0,
        paddingAfterMin: 0,
      });

      const result = await call(
        appointmentTypeRoutes.update,
        {
          id: appointmentType.id,
          data: { paddingBeforeMin: 10, paddingAfterMin: 5 },
        },
        { context: ctx },
      );

      expect(result!.paddingBeforeMin).toBe(10);
      expect(result!.paddingAfterMin).toBe(5);
    });

    test("throws NOT_FOUND for non-existent appointment type", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          appointmentTypeRoutes.update,
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

    test("throws NOT_FOUND for appointment type in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const appointmentType = await createAppointmentType(db, org2.id, {
        name: "Org 2 Type",
      });

      await expect(
        call(
          appointmentTypeRoutes.update,
          { id: appointmentType.id, data: { name: "Hacked!" } },
          { context: ctx1 },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("remove", () => {
    test("deletes an appointment type", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "To Delete",
      });

      const result = await call(
        appointmentTypeRoutes.remove,
        { id: appointmentType.id },
        { context: ctx },
      );

      expect(result.success).toBe(true);

      // Verify deleted from database
      await setTestOrgContext(db, org.id);
      const remaining = await db.select().from(appointmentTypes);
      expect(remaining).toHaveLength(0);
    });

    test("deletes appointment type with associated calendars and resources", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const calendar = await createCalendar(db, org.id, { name: "Calendar" });
      const resource = await createResource(db, org.id, { name: "Resource" });

      const appointmentType = await createAppointmentType(db, org.id, {
        name: "With Associations",
        calendarIds: [calendar.id],
        resourceIds: [{ id: resource.id, quantityRequired: 1 }],
      });

      const result = await call(
        appointmentTypeRoutes.remove,
        { id: appointmentType.id },
        { context: ctx },
      );

      expect(result.success).toBe(true);

      // Verify deleted from database
      await setTestOrgContext(db, org.id);
      const remaining = await db.select().from(appointmentTypes);
      expect(remaining).toHaveLength(0);
    });

    test("throws NOT_FOUND for non-existent appointment type", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          appointmentTypeRoutes.remove,
          { id: "00000000-0000-0000-0000-000000000000" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for appointment type in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const appointmentType = await createAppointmentType(db, org2.id, {
        name: "Org 2 Type",
      });

      await expect(
        call(
          appointmentTypeRoutes.remove,
          { id: appointmentType.id },
          { context: ctx1 },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  // ============================================================================
  // CALENDAR ASSOCIATIONS
  // ============================================================================

  describe("calendars.list", () => {
    test("returns empty list when no calendars associated", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
      });

      const result = await call(
        appointmentTypeRoutes.listCalendars,
        { appointmentTypeId: appointmentType.id },
        { context: ctx },
      );

      expect(result).toEqual([]);
    });

    test("returns associated calendars", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const calendar1 = await createCalendar(db, org.id, {
        name: "Calendar 1",
      });
      const calendar2 = await createCalendar(db, org.id, {
        name: "Calendar 2",
      });

      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
        calendarIds: [calendar1.id, calendar2.id],
      });

      const result = await call(
        appointmentTypeRoutes.listCalendars,
        { appointmentTypeId: appointmentType.id },
        { context: ctx },
      );

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.calendar.name).sort()).toEqual([
        "Calendar 1",
        "Calendar 2",
      ]);
    });

    test("throws NOT_FOUND for non-existent appointment type", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          appointmentTypeRoutes.listCalendars,
          { appointmentTypeId: "00000000-0000-0000-0000-000000000000" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("calendars.add", () => {
    test("adds calendar to appointment type", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const calendar = await createCalendar(db, org.id, { name: "Calendar" });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
      });

      const result = await call(
        appointmentTypeRoutes.addCalendar,
        {
          appointmentTypeId: appointmentType.id,
          data: { calendarId: calendar.id },
        },
        { context: ctx },
      );

      expect(result).toBeDefined();
      expect(result!.calendarId).toBe(calendar.id);
      expect(result!.appointmentTypeId).toBe(appointmentType.id);
    });

    test("throws NOT_FOUND for non-existent appointment type", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const calendar = await createCalendar(db, org.id, { name: "Calendar" });

      await expect(
        call(
          appointmentTypeRoutes.addCalendar,
          {
            appointmentTypeId: "00000000-0000-0000-0000-000000000000",
            data: { calendarId: calendar.id },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for non-existent calendar", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
      });

      await expect(
        call(
          appointmentTypeRoutes.addCalendar,
          {
            appointmentTypeId: appointmentType.id,
            data: { calendarId: "00000000-0000-0000-0000-000000000000" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws CONFLICT for duplicate association", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const calendar = await createCalendar(db, org.id, { name: "Calendar" });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
        calendarIds: [calendar.id],
      });

      await expect(
        call(
          appointmentTypeRoutes.addCalendar,
          {
            appointmentTypeId: appointmentType.id,
            data: { calendarId: calendar.id },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });
  });

  describe("calendars.remove", () => {
    test("removes calendar from appointment type", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const calendar = await createCalendar(db, org.id, { name: "Calendar" });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
        calendarIds: [calendar.id],
      });

      const result = await call(
        appointmentTypeRoutes.removeCalendar,
        {
          appointmentTypeId: appointmentType.id,
          calendarId: calendar.id,
        },
        { context: ctx },
      );

      expect(result.success).toBe(true);

      // Verify removed
      const remaining = await call(
        appointmentTypeRoutes.listCalendars,
        { appointmentTypeId: appointmentType.id },
        { context: ctx },
      );
      expect(remaining).toHaveLength(0);
    });

    test("throws NOT_FOUND for non-existent association", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const calendar = await createCalendar(db, org.id, { name: "Calendar" });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
      });

      await expect(
        call(
          appointmentTypeRoutes.removeCalendar,
          {
            appointmentTypeId: appointmentType.id,
            calendarId: calendar.id,
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  // ============================================================================
  // RESOURCE ASSOCIATIONS
  // ============================================================================

  describe("resources.list", () => {
    test("returns empty list when no resources associated", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
      });

      const result = await call(
        appointmentTypeRoutes.listResources,
        { appointmentTypeId: appointmentType.id },
        { context: ctx },
      );

      expect(result).toEqual([]);
    });

    test("returns associated resources with quantity", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const resource1 = await createResource(db, org.id, {
        name: "Resource 1",
      });
      const resource2 = await createResource(db, org.id, {
        name: "Resource 2",
      });

      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
        resourceIds: [
          { id: resource1.id, quantityRequired: 2 },
          { id: resource2.id, quantityRequired: 1 },
        ],
      });

      const result = await call(
        appointmentTypeRoutes.listResources,
        { appointmentTypeId: appointmentType.id },
        { context: ctx },
      );

      expect(result).toHaveLength(2);
      const sorted = result.sort((a, b) =>
        a.resource.name.localeCompare(b.resource.name),
      );
      expect(sorted[0]!.resource.name).toBe("Resource 1");
      expect(sorted[0]!.quantityRequired).toBe(2);
      expect(sorted[1]!.resource.name).toBe("Resource 2");
      expect(sorted[1]!.quantityRequired).toBe(1);
    });

    test("throws NOT_FOUND for non-existent appointment type", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          appointmentTypeRoutes.listResources,
          { appointmentTypeId: "00000000-0000-0000-0000-000000000000" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("resources.add", () => {
    test("adds resource to appointment type", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const resource = await createResource(db, org.id, { name: "Resource" });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
      });

      const result = await call(
        appointmentTypeRoutes.addResource,
        {
          appointmentTypeId: appointmentType.id,
          data: { resourceId: resource.id, quantityRequired: 3 },
        },
        { context: ctx },
      );

      expect(result).toBeDefined();
      expect(result!.resourceId).toBe(resource.id);
      expect(result!.appointmentTypeId).toBe(appointmentType.id);
      expect(result!.quantityRequired).toBe(3);
    });

    test("throws NOT_FOUND for non-existent appointment type", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const resource = await createResource(db, org.id, { name: "Resource" });

      await expect(
        call(
          appointmentTypeRoutes.addResource,
          {
            appointmentTypeId: "00000000-0000-0000-0000-000000000000",
            data: { resourceId: resource.id, quantityRequired: 1 },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for non-existent resource", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
      });

      await expect(
        call(
          appointmentTypeRoutes.addResource,
          {
            appointmentTypeId: appointmentType.id,
            data: {
              resourceId: "00000000-0000-0000-0000-000000000000",
              quantityRequired: 1,
            },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws CONFLICT for duplicate association", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const resource = await createResource(db, org.id, { name: "Resource" });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
        resourceIds: [{ id: resource.id, quantityRequired: 1 }],
      });

      await expect(
        call(
          appointmentTypeRoutes.addResource,
          {
            appointmentTypeId: appointmentType.id,
            data: { resourceId: resource.id, quantityRequired: 2 },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });
  });

  describe("resources.update", () => {
    test("updates resource quantity", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const resource = await createResource(db, org.id, { name: "Resource" });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
        resourceIds: [{ id: resource.id, quantityRequired: 1 }],
      });

      const result = await call(
        appointmentTypeRoutes.updateResource,
        {
          appointmentTypeId: appointmentType.id,
          resourceId: resource.id,
          data: { quantityRequired: 5 },
        },
        { context: ctx },
      );

      expect(result!.quantityRequired).toBe(5);
    });

    test("throws NOT_FOUND for non-existent association", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const resource = await createResource(db, org.id, { name: "Resource" });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
      });

      await expect(
        call(
          appointmentTypeRoutes.updateResource,
          {
            appointmentTypeId: appointmentType.id,
            resourceId: resource.id,
            data: { quantityRequired: 5 },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("resources.remove", () => {
    test("removes resource from appointment type", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const resource = await createResource(db, org.id, { name: "Resource" });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
        resourceIds: [{ id: resource.id, quantityRequired: 1 }],
      });

      const result = await call(
        appointmentTypeRoutes.removeResource,
        {
          appointmentTypeId: appointmentType.id,
          resourceId: resource.id,
        },
        { context: ctx },
      );

      expect(result.success).toBe(true);

      // Verify removed
      const remaining = await call(
        appointmentTypeRoutes.listResources,
        { appointmentTypeId: appointmentType.id },
        { context: ctx },
      );
      expect(remaining).toHaveLength(0);
    });

    test("throws NOT_FOUND for non-existent association", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const resource = await createResource(db, org.id, { name: "Resource" });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Type",
      });

      await expect(
        call(
          appointmentTypeRoutes.removeResource,
          {
            appointmentTypeId: appointmentType.id,
            resourceId: resource.id,
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("Module Exports", () => {
    test("appointment type routes module exists and exports correctly", async () => {
      const routes = await import("./appointment-types.js");

      expect(routes.appointmentTypeRoutes).toBeDefined();
      expect(routes.appointmentTypeRoutes.list).toBeDefined();
      expect(routes.appointmentTypeRoutes.get).toBeDefined();
      expect(routes.appointmentTypeRoutes.create).toBeDefined();
      expect(routes.appointmentTypeRoutes.update).toBeDefined();
      expect(routes.appointmentTypeRoutes.remove).toBeDefined();
      expect(routes.appointmentTypeRoutes.calendars).toBeDefined();
      expect(routes.appointmentTypeRoutes.calendars.list).toBeDefined();
      expect(routes.appointmentTypeRoutes.calendars.add).toBeDefined();
      expect(routes.appointmentTypeRoutes.calendars.remove).toBeDefined();
      expect(routes.appointmentTypeRoutes.resources).toBeDefined();
      expect(routes.appointmentTypeRoutes.resources.list).toBeDefined();
      expect(routes.appointmentTypeRoutes.resources.add).toBeDefined();
      expect(routes.appointmentTypeRoutes.resources.update).toBeDefined();
      expect(routes.appointmentTypeRoutes.resources.remove).toBeDefined();
    });

    test("main router includes appointment type routes", async () => {
      const { router } = await import("./index.js");

      expect(router).toBeDefined();
      expect(router.appointmentTypes).toBeDefined();
      expect(router.appointmentTypes.list).toBeDefined();
      expect(router.appointmentTypes.get).toBeDefined();
      expect(router.appointmentTypes.create).toBeDefined();
      expect(router.appointmentTypes.update).toBeDefined();
      expect(router.appointmentTypes.remove).toBeDefined();
      expect(router.appointmentTypes.calendars).toBeDefined();
      expect(router.appointmentTypes.resources).toBeDefined();
    });
  });
});
