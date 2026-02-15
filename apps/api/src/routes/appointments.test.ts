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
  getTestDb,
  setTestOrgContext,
} from "../test-utils/index.js";
import * as appointmentRoutes from "./appointments.js";
import { appointments, appointmentTypeCalendars } from "@scheduling/db/schema";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("Appointment Routes", () => {
  const db = getTestDb() as Database;

  // Helper to create a complete test fixture with availability
  async function createFixtureWithAvailability() {
    const { org, user } = await createOrg(db);
    const calendar = await createCalendar(db, org.id, {
      name: "Test Calendar",
      timezone: "America/New_York",
    });
    const appointmentType = await createAppointmentType(db, org.id, {
      name: "Consultation",
      durationMin: 60,
      calendarIds: [calendar.id],
    });

    // Add availability for all weekdays 9am-5pm
    for (let weekday = 0; weekday < 7; weekday++) {
      await createAvailabilityRule(db, calendar.id, {
        weekday,
        startTime: "09:00",
        endTime: "17:00",
      });
    }

    return { org, user, calendar, appointmentType };
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
        startAt: startAt1,
        endAt: endAt1,
      });
      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
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
      const { org, user, appointmentType } =
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

      // Get the first calendar from fixture
      const { calendar } = await createFixtureWithAvailability();

      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: startAt1,
        endAt: endAt1,
      });
      await createAppointment(db, org.id, {
        calendarId: calendar2.id,
        appointmentTypeId: appointmentType.id,
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
        startAt: startAt1,
        endAt: endAt1,
        status: "scheduled",
      });
      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
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
        startAt: pastStart.toJSDate(),
        endAt: pastStart.plus({ hours: 1 }).toJSDate(),
        status: "scheduled",
      });
      const todayConfirmed = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: todayStart.toJSDate(),
        endAt: todayStart.plus({ hours: 1 }).toJSDate(),
        status: "confirmed",
      });
      const futureScheduled = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: futureStart.toJSDate(),
        endAt: futureStart.plus({ hours: 1 }).toJSDate(),
        status: "scheduled",
      });
      const futureCancelled = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
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
        startAt: pastStart.toJSDate(),
        endAt: pastStart.plus({ hours: 1 }).toJSDate(),
        status: "scheduled",
      });
      const todayScheduled = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: todayStart.toJSDate(),
        endAt: todayStart.plus({ hours: 1 }).toJSDate(),
        status: "scheduled",
      });
      const futureCancelled = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: futureCancelledStart.toJSDate(),
        endAt: futureCancelledStart.plus({ hours: 1 }).toJSDate(),
        status: "cancelled",
      });
      const futureNoShow = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
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
        startAt: boundary.plus({ days: 2, hours: 9 }).toJSDate(),
        endAt: boundary.plus({ days: 2, hours: 10 }).toJSDate(),
        status: "no_show",
      });
      const cancelledMiddle = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: boundary.plus({ days: 1, hours: 10 }).toJSDate(),
        endAt: boundary.plus({ days: 1, hours: 11 }).toJSDate(),
        status: "cancelled",
      });
      const pastOldest = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
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
        startAt: pastStart.toJSDate(),
        endAt: pastStart.plus({ hours: 1 }).toJSDate(),
        status: "scheduled",
      });
      const futureCancelled = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
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
        startAt: startAt1,
        endAt: endAt1,
      });
      await createAppointment(db, org2.id, {
        calendarId: calendar2.id,
        appointmentTypeId: appointmentType2.id,
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

  describe("create", () => {
    test("creates a new appointment with availability validation", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startTime = getFutureStartTime(1, 10);

      const result = await call(
        appointmentRoutes.create,
        {
          calendarId: calendar.id,
          appointmentTypeId: appointmentType.id,
          startTime,
          timezone: "America/New_York",
        },
        { context: ctx },
      );

      expect(result).toBeDefined();
      expect(result!.calendarId).toBe(calendar.id);
      expect(result!.appointmentTypeId).toBe(appointmentType.id);
      expect(result!.status).toBe("scheduled");
      expect(result!.orgId).toBe(org.id);

      // Verify in database
      await setTestOrgContext(db, org.id);
      const [dbAppointment] = await db.select().from(appointments);
      expect(dbAppointment!.calendarId).toBe(calendar.id);
    });

    test("creates appointment with client", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });
      const client = await createClient(db, org.id, {
        firstName: "John",
        lastName: "Doe",
      });

      const startTime = getFutureStartTime(1, 10);

      const result = await call(
        appointmentRoutes.create,
        {
          calendarId: calendar.id,
          appointmentTypeId: appointmentType.id,
          startTime,
          timezone: "America/New_York",
          clientId: client.id,
          notes: "Test appointment",
        },
        { context: ctx },
      );

      expect(result!.clientId).toBe(client.id);
      expect(result!.notes).toBe("Test appointment");
    });

    test("throws NOT_FOUND for non-existent calendar", async () => {
      const { org, user, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startTime = getFutureStartTime(1, 10);

      await expect(
        call(
          appointmentRoutes.create,
          {
            calendarId: "00000000-0000-0000-0000-000000000000",
            appointmentTypeId: appointmentType.id,
            startTime,
            timezone: "America/New_York",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for non-existent appointment type", async () => {
      const { org, user, calendar } = await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startTime = getFutureStartTime(1, 10);

      await expect(
        call(
          appointmentRoutes.create,
          {
            calendarId: calendar.id,
            appointmentTypeId: "00000000-0000-0000-0000-000000000000",
            startTime,
            timezone: "America/New_York",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for non-existent client", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startTime = getFutureStartTime(1, 10);

      await expect(
        call(
          appointmentRoutes.create,
          {
            calendarId: calendar.id,
            appointmentTypeId: appointmentType.id,
            startTime,
            timezone: "America/New_York",
            clientId: "00000000-0000-0000-0000-000000000000",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("rejects booking in the past", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      // Create a time in the past
      const pastTime = new Date();
      pastTime.setDate(pastTime.getDate() - 1);
      pastTime.setHours(10, 0, 0, 0);

      await expect(
        call(
          appointmentRoutes.create,
          {
            calendarId: calendar.id,
            appointmentTypeId: appointmentType.id,
            startTime: pastTime,
            timezone: "America/New_York",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "UNPROCESSABLE_CONTENT",
      });
    });

    test("rejects booking outside availability window", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      // Create time outside business hours (6 AM when availability is 9-5)
      const startTime = getFutureStartTime(1, 6);

      await expect(
        call(
          appointmentRoutes.create,
          {
            calendarId: calendar.id,
            appointmentTypeId: appointmentType.id,
            startTime,
            timezone: "America/New_York",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("rejects double booking - concurrent booking rejection via exclusion constraint", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startTime = getFutureStartTime(1, 10);

      // Create first appointment
      await call(
        appointmentRoutes.create,
        {
          calendarId: calendar.id,
          appointmentTypeId: appointmentType.id,
          startTime,
          timezone: "America/New_York",
        },
        { context: ctx },
      );

      // Attempt to book same time slot
      await expect(
        call(
          appointmentRoutes.create,
          {
            calendarId: calendar.id,
            appointmentTypeId: appointmentType.id,
            startTime,
            timezone: "America/New_York",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("rejects overlapping appointment times via exclusion constraint", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startTime1 = getFutureStartTime(1, 10); // 10:00

      // Create first appointment (60 min, ends at 11:00)
      await call(
        appointmentRoutes.create,
        {
          calendarId: calendar.id,
          appointmentTypeId: appointmentType.id,
          startTime: startTime1,
          timezone: "America/New_York",
        },
        { context: ctx },
      );

      // Attempt to book overlapping slot (10:30, which overlaps with 10:00-11:00)
      const overlappingStart = new Date(startTime1.getTime() + 30 * 60 * 1000);

      await expect(
        call(
          appointmentRoutes.create,
          {
            calendarId: calendar.id,
            appointmentTypeId: appointmentType.id,
            startTime: overlappingStart,
            timezone: "America/New_York",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("concurrent booking - exactly one succeeds when two parallel requests race for same slot", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startTime = getFutureStartTime(1, 10);

      // Fire two concurrent requests for the exact same time slot
      const request1 = call(
        appointmentRoutes.create,
        {
          calendarId: calendar.id,
          appointmentTypeId: appointmentType.id,
          startTime,
          timezone: "America/New_York",
        },
        { context: ctx },
      );

      const request2 = call(
        appointmentRoutes.create,
        {
          calendarId: calendar.id,
          appointmentTypeId: appointmentType.id,
          startTime,
          timezone: "America/New_York",
        },
        { context: ctx },
      );

      // Wait for both to complete
      const results = await Promise.allSettled([request1, request2]);

      // Exactly one should succeed, exactly one should fail with CONFLICT
      const successes = results.filter((r) => r.status === "fulfilled");
      const failures = results.filter((r) => r.status === "rejected");

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      // The failure should be a CONFLICT error
      const failedResult = failures[0] as PromiseRejectedResult;
      expect(failedResult.reason).toMatchObject({
        code: "CONFLICT",
      });

      // Verify only one appointment exists in the database
      await setTestOrgContext(db, org.id);
      const dbAppointments = await db.select().from(appointments);
      expect(dbAppointments).toHaveLength(1);
    });

    test("rejects cross-type booking when resource capacity exceeded", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const calendar = await createCalendar(db, org.id, {
        name: "Test Calendar",
        timezone: "America/New_York",
      });

      // Create a resource with quantity=1 (e.g., "Conference Room")
      const resource = await createResource(db, org.id, {
        name: "Conference Room",
        quantity: 1,
      });

      // Create two appointment types that both require this resource
      const appointmentTypeA = await createAppointmentType(db, org.id, {
        name: "Type A",
        durationMin: 60,
        capacity: 10, // High calendar capacity - not the limiting factor
        calendarIds: [calendar.id],
        resourceIds: [{ id: resource.id, quantityRequired: 1 }],
      });

      const appointmentTypeB = await createAppointmentType(db, org.id, {
        name: "Type B",
        durationMin: 60,
        capacity: 10, // High calendar capacity - not the limiting factor
        calendarIds: [calendar.id],
        resourceIds: [{ id: resource.id, quantityRequired: 1 }],
      });

      // Add availability
      for (let weekday = 0; weekday < 7; weekday++) {
        await createAvailabilityRule(db, calendar.id, {
          weekday,
          startTime: "09:00",
          endTime: "17:00",
        });
      }

      const startTime = getFutureStartTime(1, 10);

      // Book type A at 2pm → succeeds
      await call(
        appointmentRoutes.create,
        {
          calendarId: calendar.id,
          appointmentTypeId: appointmentTypeA.id,
          startTime,
          timezone: "America/New_York",
        },
        { context: ctx },
      );

      // Book type B at same time → should fail with resource capacity error
      await expect(
        call(
          appointmentRoutes.create,
          {
            calendarId: calendar.id,
            appointmentTypeId: appointmentTypeB.id,
            startTime,
            timezone: "America/New_York",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("allows booking when resource has sufficient capacity", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const calendar = await createCalendar(db, org.id, {
        name: "Test Calendar",
        timezone: "America/New_York",
      });

      // Create a resource with quantity=2 (e.g., "2 Conference Rooms")
      const resource = await createResource(db, org.id, {
        name: "Conference Rooms",
        quantity: 2,
      });

      // Create two appointment types that each require 1 of this resource
      const appointmentTypeA = await createAppointmentType(db, org.id, {
        name: "Type A",
        durationMin: 60,
        capacity: 10,
        calendarIds: [calendar.id],
        resourceIds: [{ id: resource.id, quantityRequired: 1 }],
      });

      const appointmentTypeB = await createAppointmentType(db, org.id, {
        name: "Type B",
        durationMin: 60,
        capacity: 10,
        calendarIds: [calendar.id],
        resourceIds: [{ id: resource.id, quantityRequired: 1 }],
      });

      // Add availability
      for (let weekday = 0; weekday < 7; weekday++) {
        await createAvailabilityRule(db, calendar.id, {
          weekday,
          startTime: "09:00",
          endTime: "17:00",
        });
      }

      const startTime = getFutureStartTime(1, 10);

      // Book type A → succeeds
      const result1 = await call(
        appointmentRoutes.create,
        {
          calendarId: calendar.id,
          appointmentTypeId: appointmentTypeA.id,
          startTime,
          timezone: "America/New_York",
        },
        { context: ctx },
      );
      expect(result1).toBeDefined();

      // Book type B at same time → should also succeed (2 rooms available)
      const result2 = await call(
        appointmentRoutes.create,
        {
          calendarId: calendar.id,
          appointmentTypeId: appointmentTypeB.id,
          startTime,
          timezone: "America/New_York",
        },
        { context: ctx },
      );
      expect(result2).toBeDefined();

      // Third booking → should fail
      await expect(
        call(
          appointmentRoutes.create,
          {
            calendarId: calendar.id,
            appointmentTypeId: appointmentTypeA.id,
            startTime,
            timezone: "America/New_York",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("allows bookings in different locations with location-scoped resources", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const locationA = await createLocation(db, org.id, {
        name: "Location A",
      });
      const locationB = await createLocation(db, org.id, {
        name: "Location B",
      });

      const calendarA = await createCalendar(db, org.id, {
        locationId: locationA.id,
        name: "Calendar A",
        timezone: "America/New_York",
      });
      const calendarB = await createCalendar(db, org.id, {
        locationId: locationB.id,
        name: "Calendar B",
        timezone: "America/New_York",
      });

      const resourceA = await createResource(db, org.id, {
        name: "Room A",
        quantity: 1,
        locationId: locationA.id,
      });
      const resourceB = await createResource(db, org.id, {
        name: "Room B",
        quantity: 1,
        locationId: locationB.id,
      });

      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Multi-site Visit",
        durationMin: 60,
        capacity: 10,
        calendarIds: [calendarA.id, calendarB.id],
        resourceIds: [
          { id: resourceA.id, quantityRequired: 1 },
          { id: resourceB.id, quantityRequired: 1 },
        ],
      });

      for (const calendar of [calendarA, calendarB]) {
        for (let weekday = 0; weekday < 7; weekday++) {
          await createAvailabilityRule(db, calendar.id, {
            weekday,
            startTime: "09:00",
            endTime: "17:00",
          });
        }
      }

      const startTime = getFutureStartTime(1, 10);

      const resultA = await call(
        appointmentRoutes.create,
        {
          calendarId: calendarA.id,
          appointmentTypeId: appointmentType.id,
          startTime,
          timezone: "America/New_York",
        },
        { context: ctx },
      );
      expect(resultA).toBeDefined();

      const resultB = await call(
        appointmentRoutes.create,
        {
          calendarId: calendarB.id,
          appointmentTypeId: appointmentType.id,
          startTime,
          timezone: "America/New_York",
        },
        { context: ctx },
      );
      expect(resultB).toBeDefined();
    });

    test("rejects resource conflicts across calendars in the same location", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const location = await createLocation(db, org.id, {
        name: "Main Location",
      });
      const calendarA = await createCalendar(db, org.id, {
        locationId: location.id,
        name: "Calendar A",
        timezone: "America/New_York",
      });
      const calendarB = await createCalendar(db, org.id, {
        locationId: location.id,
        name: "Calendar B",
        timezone: "America/New_York",
      });

      const resource = await createResource(db, org.id, {
        name: "Shared Room",
        quantity: 1,
        locationId: location.id,
      });

      const appointmentType = await createAppointmentType(db, org.id, {
        name: "Shared Resource Visit",
        durationMin: 60,
        capacity: 10,
        calendarIds: [calendarA.id, calendarB.id],
        resourceIds: [{ id: resource.id, quantityRequired: 1 }],
      });

      for (const calendar of [calendarA, calendarB]) {
        for (let weekday = 0; weekday < 7; weekday++) {
          await createAvailabilityRule(db, calendar.id, {
            weekday,
            startTime: "09:00",
            endTime: "17:00",
          });
        }
      }

      const startTime = getFutureStartTime(1, 10);

      await call(
        appointmentRoutes.create,
        {
          calendarId: calendarA.id,
          appointmentTypeId: appointmentType.id,
          startTime,
          timezone: "America/New_York",
        },
        { context: ctx },
      );

      await expect(
        call(
          appointmentRoutes.create,
          {
            calendarId: calendarB.id,
            appointmentTypeId: appointmentType.id,
            startTime,
            timezone: "America/New_York",
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("returns conflict metadata for overlapping slot", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startTime = getFutureStartTime(1, 10);
      const endAt = new Date(startTime.getTime() + 60 * 60 * 1000);
      const existing = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: startTime,
        endAt,
      });

      try {
        await call(
          appointmentRoutes.create,
          {
            calendarId: calendar.id,
            appointmentTypeId: appointmentType.id,
            startTime,
            timezone: "America/New_York",
          },
          { context: ctx },
        );
        throw new Error("Expected slot conflict");
      } catch (error) {
        const err = error as {
          code?: string;
          data?: { conflicts?: Array<unknown> };
          cause?: { details?: { conflicts?: Array<unknown> } };
        };

        expect(err.code).toBe("CONFLICT");
        const conflicts =
          err.data?.conflicts ?? err.cause?.details?.conflicts ?? [];
        expect(conflicts.length).toBeGreaterThan(0);

        const conflict = (conflicts[0] ?? {}) as {
          conflictType?: string;
          canOverride?: boolean;
          conflictingIds?: string[];
          message?: string;
        };

        expect(conflict.conflictType).toBe("overlap");
        expect(conflict.canOverride).toBe(false);
        expect(conflict.conflictingIds ?? []).toContain(existing.id);
        expect(typeof conflict.message).toBe("string");
      }
    });
  });

  describe("update", () => {
    test("updates appointment notes", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startAt = getFutureStartTime(1, 10);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt,
        endAt,
        notes: "Original notes",
      });

      const result = await call(
        appointmentRoutes.update,
        { id: appointment.id, data: { notes: "Updated notes" } },
        { context: ctx },
      );

      expect(result!.notes).toBe("Updated notes");
    });

    test("updates appointment client", async () => {
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
      });

      const result = await call(
        appointmentRoutes.update,
        { id: appointment.id, data: { clientId: client.id } },
        { context: ctx },
      );

      expect(result!.clientId).toBe(client.id);
    });

    test("clears appointment client by setting to null", async () => {
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
      });

      const result = await call(
        appointmentRoutes.update,
        { id: appointment.id, data: { clientId: null } },
        { context: ctx },
      );

      expect(result!.clientId).toBeNull();
    });

    test("throws NOT_FOUND for non-existent appointment", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          appointmentRoutes.update,
          {
            id: "00000000-0000-0000-0000-000000000000",
            data: { notes: "Updated" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for non-existent client", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startAt = getFutureStartTime(1, 10);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt,
        endAt,
      });

      await expect(
        call(
          appointmentRoutes.update,
          {
            id: appointment.id,
            data: { clientId: "00000000-0000-0000-0000-000000000000" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for appointment in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const calendar = await createCalendar(db, org2.id, {
        name: "Org 2 Calendar",
      });
      const appointmentType = await createAppointmentType(db, org2.id, {
        name: "Org 2 Type",
        calendarIds: [calendar.id],
      });

      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const startAt = getFutureStartTime(1, 10);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org2.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt,
        endAt,
      });

      await expect(
        call(
          appointmentRoutes.update,
          { id: appointment.id, data: { notes: "Hacked!" } },
          { context: ctx1 },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("cancel", () => {
    test("cancels an appointment (scheduled -> cancelled)", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startAt = getFutureStartTime(1, 10);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt,
        endAt,
        status: "scheduled",
      });

      const result = await call(
        appointmentRoutes.cancel,
        { id: appointment.id },
        { context: ctx },
      );

      expect(result!.status).toBe("cancelled");
    });

    test("cancels with reason appended to notes", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startAt = getFutureStartTime(1, 10);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt,
        endAt,
        notes: "Original notes",
      });

      const result = await call(
        appointmentRoutes.cancel,
        { id: appointment.id, data: { reason: "Client requested" } },
        { context: ctx },
      );

      expect(result!.status).toBe("cancelled");
      expect(result!.notes).toContain("Cancelled: Client requested");
    });

    test("throws error when cancelling already cancelled appointment", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startAt = getFutureStartTime(1, 10);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt,
        endAt,
        status: "cancelled",
      });

      await expect(
        call(
          appointmentRoutes.cancel,
          { id: appointment.id },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "UNPROCESSABLE_CONTENT",
      });
    });

    test("throws NOT_FOUND for non-existent appointment", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          appointmentRoutes.cancel,
          { id: "00000000-0000-0000-0000-000000000000" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for appointment in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const calendar = await createCalendar(db, org2.id, {
        name: "Org 2 Calendar",
      });
      const appointmentType = await createAppointmentType(db, org2.id, {
        name: "Org 2 Type",
        calendarIds: [calendar.id],
      });

      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const startAt = getFutureStartTime(1, 10);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org2.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt,
        endAt,
      });

      await expect(
        call(
          appointmentRoutes.cancel,
          { id: appointment.id },
          { context: ctx1 },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("reschedule", () => {
    test("reschedules an appointment to a new valid time", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const originalStart = getFutureStartTime(1, 10);
      const originalEnd = new Date(originalStart.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: originalStart,
        endAt: originalEnd,
      });

      const newStartTime = getFutureStartTime(2, 14); // Different day, 2pm

      const result = await call(
        appointmentRoutes.reschedule,
        {
          id: appointment.id,
          data: { newStartTime, timezone: "America/New_York" },
        },
        { context: ctx },
      );

      expect(result!.id).toBe(appointment.id);
      expect(new Date(result!.startAt).getTime()).toBe(newStartTime.getTime());
    });

    test("rejects rescheduling to time in the past", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const originalStart = getFutureStartTime(1, 10);
      const originalEnd = new Date(originalStart.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: originalStart,
        endAt: originalEnd,
      });

      const pastTime = new Date();
      pastTime.setDate(pastTime.getDate() - 1);

      await expect(
        call(
          appointmentRoutes.reschedule,
          {
            id: appointment.id,
            data: { newStartTime: pastTime, timezone: "America/New_York" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "UNPROCESSABLE_CONTENT",
      });
    });

    test("rejects rescheduling cancelled appointment", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const originalStart = getFutureStartTime(1, 10);
      const originalEnd = new Date(originalStart.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: originalStart,
        endAt: originalEnd,
        status: "cancelled",
      });

      const newStartTime = getFutureStartTime(2, 14);

      await expect(
        call(
          appointmentRoutes.reschedule,
          {
            id: appointment.id,
            data: { newStartTime, timezone: "America/New_York" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "UNPROCESSABLE_CONTENT",
      });
    });

    test("rejects rescheduling to occupied slot via exclusion constraint", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const time1 = getFutureStartTime(1, 10);
      const end1 = new Date(time1.getTime() + 60 * 60 * 1000);
      const time2 = getFutureStartTime(1, 14);
      const end2 = new Date(time2.getTime() + 60 * 60 * 1000);

      const appointment1 = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: time1,
        endAt: end1,
      });
      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: time2,
        endAt: end2,
      });

      // Try to reschedule appointment1 to time2's slot
      await expect(
        call(
          appointmentRoutes.reschedule,
          {
            id: appointment1.id,
            data: { newStartTime: time2, timezone: "America/New_York" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("throws NOT_FOUND for non-existent appointment", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          appointmentRoutes.reschedule,
          {
            id: "00000000-0000-0000-0000-000000000000",
            data: { newStartTime: new Date(), timezone: "America/New_York" },
          },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for appointment in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const calendar = await createCalendar(db, org2.id, {
        name: "Org 2 Calendar",
      });
      const appointmentType = await createAppointmentType(db, org2.id, {
        name: "Org 2 Type",
        calendarIds: [calendar.id],
      });

      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const startAt = getFutureStartTime(1, 10);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org2.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt,
        endAt,
      });

      await expect(
        call(
          appointmentRoutes.reschedule,
          {
            id: appointment.id,
            data: {
              newStartTime: getFutureStartTime(2),
              timezone: "America/New_York",
            },
          },
          { context: ctx1 },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("noShow", () => {
    test("marks appointment as no-show (scheduled -> no_show)", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startAt = getFutureStartTime(1, 10);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt,
        endAt,
        status: "scheduled",
      });

      const result = await call(
        appointmentRoutes.noShow,
        { id: appointment.id },
        { context: ctx },
      );

      expect(result!.status).toBe("no_show");
    });

    test("throws error when marking cancelled appointment as no-show", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startAt = getFutureStartTime(1, 10);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt,
        endAt,
        status: "cancelled",
      });

      await expect(
        call(
          appointmentRoutes.noShow,
          { id: appointment.id },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "UNPROCESSABLE_CONTENT",
      });
    });

    test("throws error when marking already no-show appointment as no-show", async () => {
      const { org, user, calendar, appointmentType } =
        await createFixtureWithAvailability();
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      const startAt = getFutureStartTime(1, 10);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt,
        endAt,
        status: "no_show",
      });

      await expect(
        call(
          appointmentRoutes.noShow,
          { id: appointment.id },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "UNPROCESSABLE_CONTENT",
      });
    });

    test("throws NOT_FOUND for non-existent appointment", async () => {
      const { org, user } = await createOrg(db);
      const ctx = createTestContext({ orgId: org.id, userId: user.id });

      await expect(
        call(
          appointmentRoutes.noShow,
          { id: "00000000-0000-0000-0000-000000000000" },
          { context: ctx },
        ),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("throws NOT_FOUND for appointment in different org (RLS)", async () => {
      const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
      const { org: org2 } = await createOrg(db, { name: "Org 2" });
      const calendar = await createCalendar(db, org2.id, {
        name: "Org 2 Calendar",
      });
      const appointmentType = await createAppointmentType(db, org2.id, {
        name: "Org 2 Type",
        calendarIds: [calendar.id],
      });

      const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });

      const startAt = getFutureStartTime(1, 10);
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
      const appointment = await createAppointment(db, org2.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt,
        endAt,
      });

      await expect(
        call(
          appointmentRoutes.noShow,
          { id: appointment.id },
          { context: ctx1 },
        ),
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
      expect(router.appointments.noShow).toBeDefined();
    });
  });
});
