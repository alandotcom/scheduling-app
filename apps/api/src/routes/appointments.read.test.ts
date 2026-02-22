// Integration tests for appointment routes
// Tests actual handler logic with database operations

import { describe, test, expect } from "bun:test";
import { call } from "@orpc/server";
import { DateTime } from "luxon";
import {
  createTestContext,
  createOrg,
  createLocation,
  createCalendar,
  createAppointmentType,
  createResource,
  createClient,
  createAppointment,
  createAvailabilityRule,
  createSchedulingFixtureFast,
  getTestDb,
  registerDbTestReset,
  setTestOrgContext,
} from "../test-utils/index.js";
import * as appointmentRoutes from "./appointments.js";
import { appointmentTypeCalendars } from "@scheduling/db/schema";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("Appointment Routes", () => {
  registerDbTestReset("per-file");
  const db = getTestDb() as Database;

  // Helper to create a complete test fixture with availability
  async function createFixtureWithAvailability() {
    return createSchedulingFixtureFast(db);
  }

  // Helper to get a valid future start time during business hours
  // Creates times in America/New_York timezone to match the test fixtures
  function getFutureStartTime(
    daysFromNow = 1,
    hour = 10,
    timezone = "America/New_York",
  ): Date {
    return DateTime.now()
      .setZone(timezone)
      .plus({ days: daysFromNow })
      .set({ hour, minute: 0, second: 0, millisecond: 0 })
      .toJSDate();
  }

  describe("list", () => {
    test("returns empty list when no appointments exist", async () => {
      const { org, user } = await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const result = await call(
        appointmentRoutes.list,
        { limit: 10 },
        { context: ctx },
      );

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    test("returns appointments for the org", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startAt1 = getFutureStartTime(1, 10);
      const endAt1 = new Date(startAt1.getTime() + 60 * 60 * 1000);
      const startAt2 = getFutureStartTime(2, 11);
      const endAt2 = new Date(startAt2.getTime() + 60 * 60 * 1000);

      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: startAt1,
        endAt: endAt1,
      });
      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: startAt2,
        endAt: endAt2,
      });

      const result = await call(
        appointmentRoutes.list,
        { limit: 10 },
        { context: ctx },
      );

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    test("supports cursor pagination", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      // Create 3 appointments on different days
      for (let i = 1; i <= 3; i++) {
        const startAt = getFutureStartTime(i, 10);
        const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
        await createAppointment(db, org.id, {
          calendarId: calendar.id,
          appointmentTypeId: appointmentType.id,
          clientId: (await createClient(db, org.id)).id,
          startAt,
          endAt,
        });
      }

      const first = await call(
        appointmentRoutes.list,
        { limit: 2 },
        { context: ctx },
      );

      expect(first.items).toHaveLength(2);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toBeDefined();
      expect(first.nextCursor).toBe(first.items[1]?.id ?? null);

      const second = await call(
        appointmentRoutes.list,
        { limit: 2, cursor: first.nextCursor! },
        { context: ctx },
      );

      expect(second.items).toHaveLength(1);
      expect(second.hasMore).toBe(false);
    });

    test("filters by calendarId", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const calendar2 = await createCalendar(db, org.id, {
        name: "Calendar 2",
      });
      // Link appointment type to calendar2
      await setTestOrgContext(db, org.id);
      await db.insert(appointmentTypeCalendars).values({
        appointmentTypeId: appointmentType.id,
        calendarId: calendar2.id,
      });

      const startAt1 = getFutureStartTime(1, 10);
      const endAt1 = new Date(startAt1.getTime() + 60 * 60 * 1000);
      const startAt2 = getFutureStartTime(2, 10);
      const endAt2 = new Date(startAt2.getTime() + 60 * 60 * 1000);

      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: startAt1,
        endAt: endAt1,
      });
      await createAppointment(db, org.id, {
        calendarId: calendar2.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: startAt2,
        endAt: endAt2,
      });

      const result = await call(
        appointmentRoutes.list,
        { limit: 10, calendarId: calendar2.id },
        { context: ctx },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.calendarId).toBe(calendar2.id);
    });

    test("filters by status", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startAt1 = getFutureStartTime(1, 10);
      const endAt1 = new Date(startAt1.getTime() + 60 * 60 * 1000);
      const startAt2 = getFutureStartTime(2, 10);
      const endAt2 = new Date(startAt2.getTime() + 60 * 60 * 1000);

      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: startAt1,
        endAt: endAt1,
        status: "scheduled",
      });
      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: startAt2,
        endAt: endAt2,
        status: "cancelled",
      });

      const result = await call(
        appointmentRoutes.list,
        { limit: 10, status: "cancelled" },
        { context: ctx },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.status).toBe("cancelled");
    });

    test("filters by clientId", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "John",
        lastName: "Doe",
      });

      const startAt1 = getFutureStartTime(1, 10);
      const endAt1 = new Date(startAt1.getTime() + 60 * 60 * 1000);
      const startAt2 = getFutureStartTime(2, 10);
      const endAt2 = new Date(startAt2.getTime() + 60 * 60 * 1000);

      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: startAt1,
        endAt: endAt1,
        clientId: client.id,
      });
      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: startAt2,
        endAt: endAt2,
      });

      const result = await call(
        appointmentRoutes.list,
        { limit: 10, clientId: client.id },
        { context: ctx },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.clientId).toBe(client.id);
    });

    test("supports upcoming scope with timezone boundary", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const boundary = DateTime.now()
        .setZone("America/New_York")
        .startOf("day");
      const pastStart = boundary.minus({ days: 1 }).plus({ hours: 10 });
      const todayStart = boundary.plus({ hours: 9 });
      const futureStart = boundary.plus({ days: 2, hours: 11 });
      const futureCancelledStart = boundary.plus({ days: 3, hours: 10 });

      const pastScheduled = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: pastStart.toJSDate(),
        endAt: pastStart.plus({ hours: 1 }).toJSDate(),
        status: "scheduled",
      });
      const todayConfirmed = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: todayStart.toJSDate(),
        endAt: todayStart.plus({ hours: 1 }).toJSDate(),
        status: "confirmed",
      });
      const futureScheduled = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: futureStart.toJSDate(),
        endAt: futureStart.plus({ hours: 1 }).toJSDate(),
        status: "scheduled",
      });
      const futureCancelled = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: futureCancelledStart.toJSDate(),
        endAt: futureCancelledStart.plus({ hours: 1 }).toJSDate(),
        status: "cancelled",
      });

      const result = await call(
        appointmentRoutes.list,
        {
          limit: 10,
          scope: "upcoming",
          boundaryAt: boundary.toUTC().toJSDate(),
        },
        { context: ctx },
      );

      expect(result.items.map((item) => item.id)).toEqual([
        todayConfirmed.id,
        futureScheduled.id,
      ]);
      expect(result.items.some((item) => item.id === pastScheduled.id)).toBe(
        false,
      );
      expect(result.items.some((item) => item.id === futureCancelled.id)).toBe(
        false,
      );
    });

    test("supports history scope with timezone boundary", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const boundary = DateTime.now()
        .setZone("America/New_York")
        .startOf("day");
      const pastStart = boundary.minus({ days: 2 }).plus({ hours: 11 });
      const todayStart = boundary.plus({ hours: 10 });
      const futureCancelledStart = boundary.plus({ days: 1, hours: 12 });
      const futureNoShowStart = boundary.plus({ days: 2, hours: 9 });

      const pastScheduled = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: pastStart.toJSDate(),
        endAt: pastStart.plus({ hours: 1 }).toJSDate(),
        status: "scheduled",
      });
      const todayScheduled = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: todayStart.toJSDate(),
        endAt: todayStart.plus({ hours: 1 }).toJSDate(),
        status: "scheduled",
      });
      const futureCancelled = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: futureCancelledStart.toJSDate(),
        endAt: futureCancelledStart.plus({ hours: 1 }).toJSDate(),
        status: "cancelled",
      });
      const futureNoShow = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: futureNoShowStart.toJSDate(),
        endAt: futureNoShowStart.plus({ hours: 1 }).toJSDate(),
        status: "no_show",
      });

      const result = await call(
        appointmentRoutes.list,
        {
          limit: 10,
          scope: "history",
          boundaryAt: boundary.toUTC().toJSDate(),
        },
        { context: ctx },
      );

      expect(result.items.map((item) => item.id)).toEqual([
        futureNoShow.id,
        futureCancelled.id,
        pastScheduled.id,
      ]);
      expect(result.items.some((item) => item.id === todayScheduled.id)).toBe(
        false,
      );
    });

    test("paginates history scope in most-recent-first order", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const boundary = DateTime.now()
        .setZone("America/New_York")
        .startOf("day");

      const noShowNewest = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: boundary.plus({ days: 2, hours: 9 }).toJSDate(),
        endAt: boundary.plus({ days: 2, hours: 10 }).toJSDate(),
        status: "no_show",
      });
      const cancelledMiddle = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: boundary.plus({ days: 1, hours: 10 }).toJSDate(),
        endAt: boundary.plus({ days: 1, hours: 11 }).toJSDate(),
        status: "cancelled",
      });
      const pastOldest = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: boundary.minus({ days: 1, hours: 10 }).toJSDate(),
        endAt: boundary.minus({ days: 1, hours: 9 }).toJSDate(),
        status: "scheduled",
      });

      const first = await call(
        appointmentRoutes.list,
        {
          limit: 2,
          scope: "history",
          boundaryAt: boundary.toUTC().toJSDate(),
        },
        { context: ctx },
      );

      expect(first.items.map((item) => item.id)).toEqual([
        noShowNewest.id,
        cancelledMiddle.id,
      ]);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toBe(cancelledMiddle.id);

      const second = await call(
        appointmentRoutes.list,
        {
          limit: 2,
          scope: "history",
          boundaryAt: boundary.toUTC().toJSDate(),
          cursor: first.nextCursor!,
        },
        { context: ctx },
      );

      expect(second.items.map((item) => item.id)).toEqual([pastOldest.id]);
      expect(second.hasMore).toBe(false);
    });

    test("keeps existing all-items behavior when scope is omitted", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const boundary = DateTime.now()
        .setZone("America/New_York")
        .startOf("day");
      const pastStart = boundary.minus({ days: 1 }).plus({ hours: 10 });
      const futureCancelledStart = boundary.plus({ days: 1, hours: 10 });

      const pastScheduled = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: pastStart.toJSDate(),
        endAt: pastStart.plus({ hours: 1 }).toJSDate(),
        status: "scheduled",
      });
      const futureCancelled = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org.id)).id,
        startAt: futureCancelledStart.toJSDate(),
        endAt: futureCancelledStart.plus({ hours: 1 }).toJSDate(),
        status: "cancelled",
      });

      const result = await call(
        appointmentRoutes.list,
        { limit: 10 },
        { context: ctx },
      );

      expect(result.items.map((item) => item.id).sort()).toEqual(
        [pastScheduled.id, futureCancelled.id].sort(),
      );
    });

    test("does not return appointments from other orgs (RLS)", async () => {
      const {
        org: org1,
        user: user1,
        calendar,
        appointmentType,
      } = await createFixtureWithAvailability();
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const calendar2 = await createCalendar(db, org2.id, {
        name: "Org 2 Calendar",
      });
      const appointmentType2 = await createAppointmentType(db, org2.id, {
        name: "Org 2 Type",
        calendarIds: [calendar2.id],
      });

      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const startAt1 = getFutureStartTime(1, 10);
      const endAt1 = new Date(startAt1.getTime() + 60 * 60 * 1000);
      const startAt2 = getFutureStartTime(2, 10);
      const endAt2 = new Date(startAt2.getTime() + 60 * 60 * 1000);

      await createAppointment(db, org1.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org1.id)).id,
        startAt: startAt1,
        endAt: endAt1,
      });
      await createAppointment(db, org2.id, {
        calendarId: calendar2.id,
        appointmentTypeId: appointmentType2.id,
        clientId: (await createClient(db, org2.id)).id,
        startAt: startAt2,
        endAt: endAt2,
      });

      const result = await call(
        appointmentRoutes.list,
        { limit: 10 },
        { context: ctx1 },
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.orgId).toBe(org1.id);
    });
  });

  describe("range", () => {
    test("returns empty list when no appointments exist", async () => {
      const { org, user } = await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const rangeStart = getFutureStartTime(1, 8);
      const rangeEnd = getFutureStartTime(4, 8);

      const result = await call(
        appointmentRoutes.range,
        {
          startAt: rangeStart,
          endAt: rangeEnd,
          limit: 10,
        },
        { context: ctx },
      );

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    test("supports cursor pagination", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      for (let i = 1; i <= 3; i++) {
        const startAt = getFutureStartTime(i, 10 + i);
        const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
        await createAppointment(db, org.id, {
          calendarId: calendar.id,
          appointmentTypeId: appointmentType.id,
          clientId: (await createClient(db, org.id)).id,
          startAt,
          endAt,
        });
      }

      const rangeStart = getFutureStartTime(1, 8);
      const rangeEnd = getFutureStartTime(4, 8);

      const first = await call(
        appointmentRoutes.range,
        {
          startAt: rangeStart,
          endAt: rangeEnd,
          limit: 2,
        },
        { context: ctx },
      );

      expect(first.items).toHaveLength(2);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toBeDefined();

      const second = await call(
        appointmentRoutes.range,
        {
          startAt: rangeStart,
          endAt: rangeEnd,
          limit: 2,
          cursor: first.nextCursor!,
        },
        { context: ctx },
      );

      expect(second.items).toHaveLength(1);
      expect(second.hasMore).toBe(false);
      expect(second.nextCursor).toBeNull();
    });

    test("returns schedule event metadata", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const location = await createLocation(db, org.id, {
        name: "Main Office",
      });
      const calendar = await createCalendar(db, org.id, {
        name: "Range Calendar",
        timezone: "America/New_York",
        locationId: location.id,
      });
      const resource = await createResource(db, org.id, {
        name: "Exam Room",
        quantity: 2,
      });
      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Range Type",
        durationMin: 60,
        calendarIds: [calendar.id],
        resourceIds: [{ id: resource.id, quantityRequired: 2 }],
      });

      for (let weekday = 0; weekday < 7; weekday++) {
        await createAvailabilityRule(db, calendar.id, {
          weekday,
          startTime: "09:00",
          endTime: "17:00",
        });
      }

      const client = await createClient(db, org.id, {
        firstName: "Range",
        lastName: "Client",
      });

      const startAt = getFutureStartTime(1, 10);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: client.id,
        startAt,
        endAt,
        notes: "Has notes",
      });

      const result = await call(
        appointmentRoutes.range,
        {
          startAt: getFutureStartTime(1, 8),
          endAt: getFutureStartTime(1, 20),
          limit: 10,
        },
        { context: ctx },
      );

      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();

      const item = result.items[0]!;
      expect(item.id).toBe(appointment.id);
      expect(item.calendarId).toBe(calendar.id);
      expect(item.clientName).toBe("Range Client");
      expect(item.appointmentTypeName).toBe("Range Type");
      expect(item.locationName).toBe("Main Office");
      expect(item.hasNotes).toBe(true);
      expect(item.resourceSummary).toBe("2x Exam Room");
    });
  });

  describe("get", () => {
    test("returns appointment by id with relations", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "John",
        lastName: "Doe",
      });

      const startAt = getFutureStartTime(1, 10);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt,
        endAt,
        clientId: client.id,
        notes: "Test notes",
      });

      const result = await call(
        appointmentRoutes.get,
        { id: appointment.id },
        { context: ctx },
      );

      expect(result.id).toBe(appointment.id);
      expect(result.status).toBe("scheduled");
      expect(result.notes).toBe("Test notes");
      expect(result.calendar?.name).toBe("Test Calendar");
      expect(result.appointmentType?.name).toBe("Consultation");
      expect(result.client?.firstName).toBe("John");
    });

    test("throws NOT_FOUND for non-existent appointment", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          appointmentRoutes.get,
          { id: "00000000-0000-0000-0000-000000000000" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for appointment in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const {
        org: org2,
        calendar,
        appointmentType,
      } = await (async () => {
        const { org, user } = await createOrg(db, { name: "Org 2" });
        const calendar = await createCalendar(db, org.id, {
          name: "Org 2 Calendar",
        });
        const appointmentType = await createAppointmentType(db, org.id, {
          name: "Org 2 Type",
          calendarIds: [calendar.id],
        });
        return { org, user, calendar, appointmentType };
      })();

      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const startAt = getFutureStartTime(1, 10);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org2.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        clientId: (await createClient(db, org2.id)).id,
        startAt,
        endAt,
      });

      await expect(
        call(appointmentRoutes.get, { id: appointment.id }, { context: ctx1 }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("Module Exports", () => {
    test("appointment routes module exists and exports correctly", async () => {
      const routes = await import("./appointments.js");

      expect(routes.appointmentRoutes).toBeDefined();
      expect(routes.appointmentRoutes.list).toBeDefined();
      expect(routes.appointmentRoutes.get).toBeDefined();
      expect(routes.appointmentRoutes.create).toBeDefined();
      expect(routes.appointmentRoutes.update).toBeDefined();
      expect(routes.appointmentRoutes.cancel).toBeDefined();
      expect(routes.appointmentRoutes.reschedule).toBeDefined();
      expect(routes.appointmentRoutes.confirm).toBeDefined();
      expect(routes.appointmentRoutes.noShow).toBeDefined();
    });

    test("main router includes appointment routes", async () => {
      const { router } = await import("./index.js");

      expect(router).toBeDefined();
      expect(router.appointments).toBeDefined();
      expect(router.appointments.list).toBeDefined();
      expect(router.appointments.get).toBeDefined();
      expect(router.appointments.create).toBeDefined();
      expect(router.appointments.update).toBeDefined();
      expect(router.appointments.cancel).toBeDefined();
      expect(router.appointments.reschedule).toBeDefined();
      expect(router.appointments.confirm).toBeDefined();
      expect(router.appointments.noShow).toBeDefined();
    });
  });
});
