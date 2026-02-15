import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import { DateTime } from "luxon";
import {
  createAppointment,
  createAppointmentType,
  createCalendar,
  createClient,
  createOrg,
  createTestContext,
  getTestDb,
} from "../test-utils/index.js";
import { summary } from "./dashboard.js";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

const DASHBOARD_TZ = "America/New_York";

describe("Dashboard Routes", () => {
  const db = getTestDb() as Database;

  test("returns accurate summary counts for the org and date window", async () => {
    const { org, user } = await createOrg(db);
    const calendar = await createCalendar(db, org.id, {
      timezone: DASHBOARD_TZ,
    });
    const appointmentType = await createAppointmentType(db, org.id, {
      calendarIds: [calendar.id],
    });
    await createClient(db, org.id, { firstName: "Alice", lastName: "A" });
    await createClient(db, org.id, { firstName: "Bob", lastName: "B" });

    const todayStart = DateTime.now().setZone(DASHBOARD_TZ).startOf("day");
    const todayEnd = todayStart.plus({ days: 1 });
    const dayOfWeek = todayStart.weekday % 7;
    const daysUntilWeekEnd = (7 - dayOfWeek) % 7;
    const weekEndExclusive = todayEnd.plus({ days: daysUntilWeekEnd });

    const slots = [
      {
        startAt: todayStart.plus({ hours: 9 }).toJSDate(),
        status: "scheduled" as const,
      },
      {
        startAt: todayStart.plus({ hours: 11 }).toJSDate(),
        status: "no_show" as const,
      },
      {
        startAt: todayStart
          .plus({ days: Math.min(2, daysUntilWeekEnd), hours: 14 })
          .toJSDate(),
        status: "cancelled" as const,
      },
      {
        startAt: todayStart
          .plus({ days: daysUntilWeekEnd, hours: 16 })
          .toJSDate(),
        status: "scheduled" as const,
      },
      {
        startAt: weekEndExclusive.plus({ hours: 10 }).toJSDate(),
        status: "scheduled" as const,
      },
    ];

    for (const slot of slots) {
      const endAt = DateTime.fromJSDate(slot.startAt)
        .plus({ minutes: 30 })
        .toJSDate();
      await createAppointment(db, org.id, {
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: slot.startAt,
        endAt,
        status: slot.status,
        timezone: DASHBOARD_TZ,
      });
    }

    const expectedTodayAppointments = slots.filter(
      (slot) =>
        slot.startAt >= todayStart.toJSDate() &&
        slot.startAt < todayEnd.toJSDate(),
    ).length;
    const expectedWeekAppointments = slots.filter(
      (slot) =>
        slot.startAt >= todayStart.toJSDate() &&
        slot.startAt < weekEndExclusive.toJSDate(),
    ).length;
    const expectedPendingAppointments = slots.filter(
      (slot) =>
        slot.status === "scheduled" &&
        slot.startAt >= todayStart.toJSDate() &&
        slot.startAt < weekEndExclusive.toJSDate(),
    ).length;
    const expectedNoShows = slots.filter(
      (slot) =>
        slot.status === "no_show" &&
        slot.startAt >= todayStart.toJSDate() &&
        slot.startAt < weekEndExclusive.toJSDate(),
    ).length;

    const context = createTestContext({ orgId: org.id, userId: user.id });
    const result = await call(summary, undefined as never, { context });

    expect(result.todayAppointments).toBe(expectedTodayAppointments);
    expect(result.weekAppointments).toBe(expectedWeekAppointments);
    expect(result.pendingAppointments).toBe(expectedPendingAppointments);
    expect(result.noShows).toBe(expectedNoShows);
    expect(result.clients).toBe(2);
    expect(result.calendars).toBe(1);
  });

  test("does not include data from other orgs", async () => {
    const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
    const { org: org2 } = await createOrg(db, { name: "Org 2" });

    const calendar1 = await createCalendar(db, org1.id, {
      timezone: DASHBOARD_TZ,
    });
    const appointmentType1 = await createAppointmentType(db, org1.id, {
      calendarIds: [calendar1.id],
    });

    const calendar2 = await createCalendar(db, org2.id, {
      timezone: DASHBOARD_TZ,
    });
    const appointmentType2 = await createAppointmentType(db, org2.id, {
      calendarIds: [calendar2.id],
    });

    await createClient(db, org1.id, { firstName: "Org", lastName: "One" });
    await createClient(db, org2.id, { firstName: "Org", lastName: "Two" });
    await createClient(db, org2.id, { firstName: "Org", lastName: "Two B" });

    const startAt = DateTime.now()
      .setZone(DASHBOARD_TZ)
      .startOf("day")
      .plus({ hours: 10 })
      .toJSDate();
    const endAt = DateTime.fromJSDate(startAt).plus({ minutes: 30 }).toJSDate();

    await createAppointment(db, org1.id, {
      calendarId: calendar1.id,
      appointmentTypeId: appointmentType1.id,
      startAt,
      endAt,
      status: "scheduled",
      timezone: DASHBOARD_TZ,
    });
    await createAppointment(db, org2.id, {
      calendarId: calendar2.id,
      appointmentTypeId: appointmentType2.id,
      startAt,
      endAt,
      status: "scheduled",
      timezone: DASHBOARD_TZ,
    });

    const context = createTestContext({ orgId: org1.id, userId: user1.id });
    const result = await call(summary, undefined as never, { context });

    expect(result.clients).toBe(1);
    expect(result.calendars).toBe(1);
    expect(result.todayAppointments).toBe(1);
  });
});
