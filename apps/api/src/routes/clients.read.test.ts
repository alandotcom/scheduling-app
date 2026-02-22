// Integration tests for client routes
// Tests actual handler logic with database operations

import { describe, test, expect } from "bun:test";
import { call } from "@orpc/server";
import { DateTime } from "luxon";
import {
  createTestContext,
  createOrg,
  createCalendar,
  createAppointmentType,
  createClient,
  createAppointment,
  getTestDb,
  registerDbTestReset,
} from "../test-utils/index.js";
import * as clientRoutes from "./clients.js";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("Client Routes", () => {
  registerDbTestReset("per-file");
  const db = getTestDb() as Database;

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

    test("supports sorting by most recently updated", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const older = await createClient(db, org.id, {
        firstName: "Older",
        lastName: "Client",
      });
      await createClient(db, org.id, {
        firstName: "Newer",
        lastName: "Client",
      });

      await call(
        clientRoutes.update,
        { id: older.id, data: { lastName: "Recently Updated" } },
        { context: ctx },
      );

      const result = await call(
        clientRoutes.list,
        { limit: 10, sort: "updated_at_desc" },
        { context: ctx },
      );

      expect(result.items[0]!.id).toBe(older.id);
      expect(result.items[0]!.lastName).toBe("Recently Updated");
    });

    test("supports cursor pagination when sorting by most recently updated", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const first = await createClient(db, org.id, {
        firstName: "First",
        lastName: "Client",
      });
      const second = await createClient(db, org.id, {
        firstName: "Second",
        lastName: "Client",
      });
      const third = await createClient(db, org.id, {
        firstName: "Third",
        lastName: "Client",
      });

      await call(
        clientRoutes.update,
        { id: first.id, data: { lastName: "Most Recent" } },
        { context: ctx },
      );

      const firstPage = await call(
        clientRoutes.list,
        { limit: 2, sort: "updated_at_desc" },
        { context: ctx },
      );

      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.nextCursor).toBeTruthy();

      const secondPage = await call(
        clientRoutes.list,
        {
          limit: 2,
          sort: "updated_at_desc",
          cursor: firstPage.nextCursor ?? undefined,
        },
        { context: ctx },
      );

      expect(secondPage.items).toHaveLength(1);
      expect(secondPage.hasMore).toBe(false);
      expect(secondPage.nextCursor).toBeNull();

      const allReturnedIds = [
        ...firstPage.items.map((client) => client.id),
        ...secondPage.items.map((client) => client.id),
      ];
      expect(new Set(allReturnedIds).size).toBe(3);
      expect(allReturnedIds.sort()).toEqual(
        [first.id, second.id, third.id].sort(),
      );
    });

    test("returns an empty page when updated_at_desc cursor does not exist", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await createClient(db, org.id, {
        firstName: "John",
        lastName: "Doe",
      });

      const result = await call(
        clientRoutes.list,
        {
          limit: 10,
          sort: "updated_at_desc",
          cursor: "00000000-0000-7000-8000-000000000000",
        },
        { context: ctx },
      );

      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
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

    test("includes relationship appointment counts excluding cancelled", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const calendar = await createCalendar(db, org.id, {
        name: "Count Calendar",
      });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Count Type",
        calendarIds: [calendar.id],
      });
      const countedClient = await createClient(db, org.id, {
        firstName: "Counted",
        lastName: "Client",
      });
      const emptyClient = await createClient(db, org.id, {
        firstName: "Empty",
        lastName: "Client",
      });

      const base = DateTime.now()
        .set({ second: 0, millisecond: 0 })
        .plus({ days: 1 });

      const firstStart = base.toJSDate();
      const secondStart = base.plus({ hours: 2 }).toJSDate();
      const cancelledStart = base.plus({ hours: 4 }).toJSDate();

      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: countedClient.id,
        startAt: firstStart,
        endAt: new Date(firstStart.getTime() + 30 * 60 * 1000),
        status: "scheduled",
      });
      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: countedClient.id,
        startAt: secondStart,
        endAt: new Date(secondStart.getTime() + 30 * 60 * 1000),
        status: "confirmed",
      });
      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: countedClient.id,
        startAt: cancelledStart,
        endAt: new Date(cancelledStart.getTime() + 30 * 60 * 1000),
        status: "cancelled",
      });

      const result = await call(
        clientRoutes.list,
        { limit: 10 },
        { context: ctx },
      );

      const counted = result.items.find(
        (client) => client.id === countedClient.id,
      );
      const empty = result.items.find((client) => client.id === emptyClient.id);

      expect(counted?.relationshipCounts.appointments).toBe(2);
      expect(empty?.relationshipCounts.appointments).toBe(0);
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

    test("returns history summary by reference ID", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const calendar = await createCalendar(db, org.id, {
        name: "Reference History Calendar",
      });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Reference History Type",
        calendarIds: [calendar.id],
      });
      const client = await createClient(db, org.id, {
        firstName: "Reference",
        lastName: "History",
        referenceId: "ext-history-1",
      });

      const now = DateTime.now().set({ second: 0, millisecond: 0 });
      const futureStart = now.plus({ days: 1 }).toJSDate();
      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: client.id,
        startAt: futureStart,
        endAt: new Date(futureStart.getTime() + 30 * 60 * 1000),
        status: "scheduled",
      });

      const result = await call(
        clientRoutes.historySummaryByReference,
        { referenceId: "ext-history-1" },
        { context: ctx },
      );

      expect(result.clientId).toBe(client.id);
      expect(result.totalAppointments).toBe(1);
      expect(result.upcomingAppointments).toBe(1);
    });

    test("throws NOT_FOUND for missing reference ID history summary", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          clientRoutes.historySummaryByReference,
          { referenceId: "missing-reference" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
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
        phone: "+14155551234",
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
      expect(result.phone).toBe("+14155551234");
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

    test("returns client by reference ID", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "Reference",
        lastName: "Lookup",
        referenceId: "ext-client-1",
      });

      const result = await call(
        clientRoutes.getByReference,
        { referenceId: "ext-client-1" },
        { context: ctx },
      );

      expect(result.id).toBe(client.id);
      expect(result.referenceId).toBe("ext-client-1");
    });

    test("throws NOT_FOUND for missing reference ID", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          clientRoutes.getByReference,
          { referenceId: "missing-reference" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("does not return clients from other orgs by reference ID (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      await createClient(db, org2.id, {
        firstName: "Other",
        lastName: "Org",
        referenceId: "shared-reference",
      });

      await expect(
        call(
          clientRoutes.getByReference,
          { referenceId: "shared-reference" },
          { context: ctx1 },
        ),
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
      expect(routes.clientRoutes.getByReference).toBeDefined();
      expect(routes.clientRoutes.create).toBeDefined();
      expect(routes.clientRoutes.update).toBeDefined();
      expect(routes.clientRoutes.updateByReference).toBeDefined();
      expect(routes.clientRoutes.remove).toBeDefined();
      expect(routes.clientRoutes.removeByReference).toBeDefined();
      expect(routes.clientRoutes.historySummaryByReference).toBeDefined();
    });

    test("main router includes client routes", async () => {
      const { router } = await import("./index.js");

      expect(router).toBeDefined();
      expect(router.clients).toBeDefined();
      expect(router.clients.list).toBeDefined();
      expect(router.clients.get).toBeDefined();
      expect(router.clients.getByReference).toBeDefined();
      expect(router.clients.create).toBeDefined();
      expect(router.clients.update).toBeDefined();
      expect(router.clients.updateByReference).toBeDefined();
      expect(router.clients.remove).toBeDefined();
      expect(router.clients.removeByReference).toBeDefined();
      expect(router.clients.historySummaryByReference).toBeDefined();
    });
  });
});
