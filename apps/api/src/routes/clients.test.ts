// Integration tests for client routes
// Tests actual handler logic with database operations

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { call } from "@orpc/server";
import { DateTime } from "luxon";
import {
  createTestContext,
  createOrg,
  createCalendar,
  createAppointmentType,
  createClient,
  createAppointment,
  createTestDb,
  resetTestDb,
  closeTestDb,
  setTestOrgContext,
} from "../test-utils/index.js";
import * as clientRoutes from "./clients.js";
import { clients } from "@scheduling/db/schema";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("Client Routes", () => {
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
    test("returns empty list when no clients exist", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        clientRoutes.list,
        { limit: 10 },
        { context: ctx },
      );

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    test("returns clients for the org", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createClient(db, org.id, { firstName: "John", lastName: "Doe" });
      await createClient(db, org.id, { firstName: "Jane", lastName: "Smith" });

      const result = await call(
        clientRoutes.list,
        { limit: 10 },
        { context: ctx },
      );

      expect(result.items).toHaveLength(2);
      expect(result.items.map((c) => c.firstName).sort()).toEqual([
        "Jane",
        "John",
      ]);
      expect(result.hasMore).toBe(false);
    });

    test("supports cursor pagination", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createClient(db, org.id, { firstName: "Client", lastName: "1" });
      await createClient(db, org.id, { firstName: "Client", lastName: "2" });
      await createClient(db, org.id, { firstName: "Client", lastName: "3" });

      const first = await call(
        clientRoutes.list,
        { limit: 2 },
        { context: ctx },
      );

      expect(first.items).toHaveLength(2);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toBeDefined();

      const second = await call(
        clientRoutes.list,
        { limit: 2, cursor: first.nextCursor! },
        { context: ctx },
      );

      expect(second.items).toHaveLength(1);
      expect(second.hasMore).toBe(false);
    });

    test("filters by search term (firstName)", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createClient(db, org.id, { firstName: "John", lastName: "Doe" });
      await createClient(db, org.id, { firstName: "Jane", lastName: "Smith" });

      const result = await call(
        clientRoutes.list,
        { limit: 10, search: "John" },
        { context: ctx },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.firstName).toBe("John");
    });

    test("filters by search term (lastName)", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createClient(db, org.id, { firstName: "John", lastName: "Doe" });
      await createClient(db, org.id, { firstName: "Jane", lastName: "Smith" });

      const result = await call(
        clientRoutes.list,
        { limit: 10, search: "Smith" },
        { context: ctx },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.lastName).toBe("Smith");
    });

    test("filters by search term (email)", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createClient(db, org.id, {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
      });
      await createClient(db, org.id, {
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@other.com",
      });

      const result = await call(
        clientRoutes.list,
        { limit: 10, search: "example.com" },
        { context: ctx },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.firstName).toBe("John");
    });

    test("search is case-insensitive", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createClient(db, org.id, { firstName: "John", lastName: "Doe" });

      const result = await call(
        clientRoutes.list,
        { limit: 10, search: "JOHN" },
        { context: ctx },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.firstName).toBe("John");
    });

    test("does not return clients from other orgs (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      await createClient(db, org1.id, {
        firstName: "Org1",
        lastName: "Client",
      });
      await createClient(db, org2.id, {
        firstName: "Org2",
        lastName: "Client",
      });

      const result = await call(
        clientRoutes.list,
        { limit: 10 },
        { context: ctx1 },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.firstName).toBe("Org1");
    });
  });

  describe("historySummary", () => {
    test("returns counts as numbers with expected totals", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const calendar = await createCalendar(db, org.id, {
        name: "History Calendar",
        timezone: "America/New_York",
      });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "History Type",
        durationMin: 60,
        calendarIds: [calendar.id],
      });
      const client = await createClient(db, org.id, {
        firstName: "History",
        lastName: "Client",
      });

      const now = DateTime.now().set({ second: 0, millisecond: 0 });
      const pastScheduledStart = now
        .minus({ days: 2 })
        .set({ hour: 9, minute: 0 })
        .toJSDate();
      const pastScheduledEnd = new Date(
        pastScheduledStart.getTime() + 60 * 60 * 1000,
      );
      const pastNoShowStart = now
        .minus({ days: 1 })
        .set({ hour: 10, minute: 0 })
        .toJSDate();
      const pastNoShowEnd = new Date(
        pastNoShowStart.getTime() + 60 * 60 * 1000,
      );
      const futureScheduledStart = now
        .plus({ days: 2 })
        .set({ hour: 11, minute: 0 })
        .toJSDate();
      const futureScheduledEnd = new Date(
        futureScheduledStart.getTime() + 60 * 60 * 1000,
      );
      const futureCancelledStart = now
        .plus({ days: 1 })
        .set({ hour: 12, minute: 0 })
        .toJSDate();
      const futureCancelledEnd = new Date(
        futureCancelledStart.getTime() + 60 * 60 * 1000,
      );

      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: client.id,
        startAt: pastScheduledStart,
        endAt: pastScheduledEnd,
        status: "scheduled",
      });
      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: client.id,
        startAt: pastNoShowStart,
        endAt: pastNoShowEnd,
        status: "no_show",
      });
      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: client.id,
        startAt: futureScheduledStart,
        endAt: futureScheduledEnd,
        status: "scheduled",
      });
      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: client.id,
        startAt: futureCancelledStart,
        endAt: futureCancelledEnd,
        status: "cancelled",
      });

      const result = await call(
        clientRoutes.historySummary,
        { id: client.id },
        { context: ctx },
      );

      expect(result.totalAppointments).toBe(4);
      expect(result.upcomingAppointments).toBe(1);
      expect(result.pastAppointments).toBe(2);
      expect(result.cancelledAppointments).toBe(1);
      expect(result.noShowAppointments).toBe(1);
      expect(typeof result.totalAppointments).toBe("number");
      expect(typeof result.upcomingAppointments).toBe("number");
      expect(typeof result.pastAppointments).toBe("number");
      expect(typeof result.cancelledAppointments).toBe("number");
      expect(typeof result.noShowAppointments).toBe("number");
      expect(result.lastAppointmentAt?.toISOString()).toBe(
        pastNoShowStart.toISOString(),
      );
      expect(result.nextAppointmentAt?.toISOString()).toBe(
        futureScheduledStart.toISOString(),
      );
    });

    test("returns zero counts when client has no appointments", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "Empty",
        lastName: "History",
      });

      const result = await call(
        clientRoutes.historySummary,
        { id: client.id },
        { context: ctx },
      );

      expect(result.totalAppointments).toBe(0);
      expect(result.upcomingAppointments).toBe(0);
      expect(result.pastAppointments).toBe(0);
      expect(result.cancelledAppointments).toBe(0);
      expect(result.noShowAppointments).toBe(0);
      expect(typeof result.totalAppointments).toBe("number");
      expect(typeof result.upcomingAppointments).toBe("number");
      expect(typeof result.pastAppointments).toBe("number");
      expect(typeof result.cancelledAppointments).toBe("number");
      expect(typeof result.noShowAppointments).toBe("number");
      expect(result.lastAppointmentAt).toBeNull();
      expect(result.nextAppointmentAt).toBeNull();
    });
  });

  describe("get", () => {
    test("returns client by id", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        phone: "555-1234",
      });

      const result = await call(
        clientRoutes.get,
        { id: client.id },
        { context: ctx },
      );

      expect(result.id).toBe(client.id);
      expect(result.firstName).toBe("John");
      expect(result.lastName).toBe("Doe");
      expect(result.email).toBe("john@example.com");
      expect(result.phone).toBe("555-1234");
    });

    test("throws NOT_FOUND for non-existent client", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          clientRoutes.get,
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
        call(clientRoutes.get, { id: client.id }, { context: ctx1 }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

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
          phone: "555-5678",
        },
        { context: ctx },
      );

      expect(result).toBeDefined();
      expect(result!.firstName).toBe("New");
      expect(result!.lastName).toBe("Client");
      expect(result!.email).toBe("new@example.com");
      expect(result!.phone).toBe("555-5678");
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
    });
  });

  describe("update", () => {
    test("updates client firstName", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "Original",
        lastName: "Client",
      });

      const result = await call(
        clientRoutes.update,
        { id: client.id, data: { firstName: "Updated" } },
        { context: ctx },
      );

      expect(result!.firstName).toBe("Updated");
    });

    test("updates client lastName", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "Test",
        lastName: "Original",
      });

      const result = await call(
        clientRoutes.update,
        { id: client.id, data: { lastName: "Updated" } },
        { context: ctx },
      );

      expect(result!.lastName).toBe("Updated");
    });

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
        { id: client.id, data: { email: "new@example.com" } },
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
        phone: "555-0000",
      });

      const result = await call(
        clientRoutes.update,
        { id: client.id, data: { phone: "555-9999" } },
        { context: ctx },
      );

      expect(result!.phone).toBe("555-9999");
    });

    test("throws NOT_FOUND for non-existent client", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          clientRoutes.update,
          {
            id: "00000000-0000-0000-0000-000000000000",
            data: { firstName: "Updated" },
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
          { id: client.id, data: { firstName: "Hacked!" } },
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
  });

  describe("Module Exports", () => {
    test("client routes module exists and exports correctly", async () => {
      const routes = await import("./clients.js");

      expect(routes.clientRoutes).toBeDefined();
      expect(routes.clientRoutes.list).toBeDefined();
      expect(routes.clientRoutes.get).toBeDefined();
      expect(routes.clientRoutes.create).toBeDefined();
      expect(routes.clientRoutes.update).toBeDefined();
      expect(routes.clientRoutes.remove).toBeDefined();
    });

    test("main router includes client routes", async () => {
      const { router } = await import("./index.js");

      expect(router).toBeDefined();
      expect(router.clients).toBeDefined();
      expect(router.clients.list).toBeDefined();
      expect(router.clients.get).toBeDefined();
      expect(router.clients.create).toBeDefined();
      expect(router.clients.update).toBeDefined();
      expect(router.clients.remove).toBeDefined();
    });
  });
});
