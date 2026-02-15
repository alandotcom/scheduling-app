import {
  describe,
  test,
  expect,
  } from "bun:test";
import { call } from "@orpc/server";
import { DateTime } from "luxon";
import {
  createTestContext,
  createCalendar,
  createAvailabilityRule,
  getTestDb,
  } from "../test-utils/index.js";
import {
  createAvailabilityFixture,
  getAvailabilityRoutes,
  type AvailabilityTestDb,
} from "../test-utils/availability-test-helpers.js";

describe("Availability Engine", () => {
  const db = getTestDb() as AvailabilityTestDb;

  test("getDates returns available dates", async () => {
    const { org, user, calendar, appointmentType, timezone } =
      await createAvailabilityFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const day = DateTime.fromObject(
      { year: 2030, month: 1, day: 15 },
      { zone: timezone },
    ).startOf("day");
    const weekday = day.weekday % 7;

    await createAvailabilityRule(db, calendar.id, {
      weekday,
      startTime: "09:00",
      endTime: "10:00",
    });

    const result = await call(
      availabilityRoutes.engine.dates,
      {
        appointmentTypeId: appointmentType.id,
        calendarIds: [calendar.id],
        startDate: day.toISODate()!,
        endDate: day.toISODate()!,
        timezone,
      },
      { context: ctx },
    );

    expect(result.dates).toEqual([day.toISODate()!]);
  });

  test("getTimes returns expected slots", async () => {
    const { org, user, calendar, appointmentType, timezone } =
      await createAvailabilityFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const day = DateTime.fromObject(
      { year: 2030, month: 1, day: 16 },
      { zone: timezone },
    ).startOf("day");
    const weekday = day.weekday % 7;

    await createAvailabilityRule(db, calendar.id, {
      weekday,
      startTime: "09:00",
      endTime: "10:00",
    });

    const result = await call(
      availabilityRoutes.engine.times,
      {
        appointmentTypeId: appointmentType.id,
        calendarIds: [calendar.id],
        startDate: day.toISODate()!,
        endDate: day.toISODate()!,
        timezone,
      },
      { context: ctx },
    );

    expect(result.slots).toHaveLength(1);
    const slot = result.slots[0]!;
    const expectedStart = day
      .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
      .toJSDate()
      .toISOString();
    const expectedEnd = day
      .set({ hour: 10, minute: 0, second: 0, millisecond: 0 })
      .toJSDate()
      .toISOString();

    expect(slot.start).toBe(expectedStart);
    expect(slot.end).toBe(expectedEnd);
    expect(slot.available).toBe(true);
  });

  test("getDates throws when calendar is not linked", async () => {
    const { org, user, appointmentType, timezone } =
      await createAvailabilityFixture(db);
    const calendar = await createCalendar(db, org.id, {
      name: "Unlinked Calendar",
      timezone,
    });
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const date = DateTime.fromObject(
      { year: 2030, month: 1, day: 20 },
      { zone: timezone },
    ).toISODate()!;

    await expect(
      call(
        availabilityRoutes.engine.dates,
        {
          appointmentTypeId: appointmentType.id,
          calendarIds: [calendar.id],
          startDate: date,
          endDate: date,
          timezone,
        },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("checkSlot returns availability and error reasons", async () => {
    const { org, user, calendar, appointmentType, timezone } =
      await createAvailabilityFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const day = DateTime.fromObject(
      { year: 2030, month: 1, day: 21 },
      { zone: timezone },
    ).startOf("day");
    const weekday = day.weekday % 7;
    const slotStart = day
      .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
      .toJSDate();

    await createAvailabilityRule(db, calendar.id, {
      weekday,
      startTime: "09:00",
      endTime: "10:00",
    });

    const available = await call(
      availabilityRoutes.engine.check,
      {
        appointmentTypeId: appointmentType.id,
        calendarId: calendar.id,
        startTime: slotStart.toISOString(),
        timezone,
      },
      { context: ctx },
    );

    expect(available.available).toBe(true);

    const invalidCalendar = await call(
      availabilityRoutes.engine.check,
      {
        appointmentTypeId: appointmentType.id,
        calendarId: "00000000-0000-0000-0000-000000000000",
        startTime: slotStart.toISOString(),
        timezone,
      },
      { context: ctx },
    );

    expect(invalidCalendar.available).toBe(false);
    expect(invalidCalendar.reason).toBe("INVALID_CALENDAR");

    const missingAppointmentType = await call(
      availabilityRoutes.engine.check,
      {
        appointmentTypeId: "00000000-0000-0000-0000-000000000000",
        calendarId: calendar.id,
        startTime: slotStart.toISOString(),
        timezone,
      },
      { context: ctx },
    );

    expect(missingAppointmentType.available).toBe(false);
    expect(missingAppointmentType.reason).toBe("APPOINTMENT_TYPE_NOT_FOUND");
  });
});
