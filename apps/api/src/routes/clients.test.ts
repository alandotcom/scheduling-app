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
  setTestOrgContext,
} from "../test-utils/index.js";
import * as clientRoutes from "./clients.js";
import { clients } from "@scheduling/db/schema";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("Client Routes", () => {
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
        phone: "+14155550000",
      });

      const result = await call(
        clientRoutes.update,
        { id: client.id, data: { phone: "+14155559999" } },
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
        { id: client.id, data: { referenceId: "ext-updated" } },
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
        { id: client.id, data: { referenceId: null } },
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
        { id: client.id, data: { phone: "(415) 555-2671" } },
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
          { id: client.id, data: { phone: "invalid-phone" } },
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
          { id: second.id, data: { email: "FIRST@EXAMPLE.COM" } },
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
          { id: second.id, data: { phone: "(415) 555-2671" } },
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
          { id: second.id, data: { referenceId: "ext-first" } },
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
          referenceId: "ext-old",
          data: { firstName: "Updated", referenceId: "ext-new" },
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
            referenceId: "ext-second",
            data: { referenceId: "ext-first" },
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
          { referenceId: "missing-reference", data: { firstName: "Nope" } },
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

    test("deletes a client by reference ID", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      await createClient(db, org.id, {
        firstName: "ByRef",
        lastName: "Delete",
        referenceId: "ext-delete",
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
