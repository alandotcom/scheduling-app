import { describe, test, expect } from "bun:test";
import { call } from "@orpc/server";
import { DateTime } from "luxon";
import {
  createTestContext,
  createCalendar,
  createAvailabilityRule,
  createClient,
  createAppointment,
  getTestDb,
  registerDbTestReset,
} from "../test-utils/index.js";
import {
  createAvailabilityFixture,
  getAvailabilityRoutes,
  type AvailabilityTestDb,
} from "../test-utils/availability-test-helpers.js";

describe("Availability Engine", () => {
  registerDbTestReset("per-file");
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
        calendarId: calendar.id,
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
        calendarId: calendar.id,
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

  test("getTimes can exclude an existing appointment", async () => {
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

    const client = await createClient(db, org.id, {
      firstName: "Slot",
      lastName: "Holder",
    });
    const appointment = await createAppointment(db, org.id, {
      calendarId: calendar.id,
      appointmentTypeId: appointmentType.id,
      clientId: client.id,
      startAt: day
        .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
        .toJSDate(),
      endAt: day
        .set({ hour: 10, minute: 0, second: 0, millisecond: 0 })
        .toJSDate(),
      timezone,
    });

    const withoutExclusion = await call(
      availabilityRoutes.engine.times,
      {
        appointmentTypeId: appointmentType.id,
        calendarId: calendar.id,
        startDate: day.toISODate()!,
        endDate: day.toISODate()!,
        timezone,
      },
      { context: ctx },
    );
    const withExclusion = await call(
      availabilityRoutes.engine.times,
      {
        appointmentTypeId: appointmentType.id,
        calendarId: calendar.id,
        excludeAppointmentId: appointment.id,
        startDate: day.toISODate()!,
        endDate: day.toISODate()!,
        timezone,
      },
      { context: ctx },
    );

    expect(withoutExclusion.slots).toHaveLength(1);
    expect(withoutExclusion.slots[0]?.available).toBe(false);
    expect(withExclusion.slots).toHaveLength(1);
    expect(withExclusion.slots[0]?.available).toBe(true);
  });

  test("getPreviewTimes applies draft overlays", async () => {
    const { org, user, calendar, timezone } =
      await createAvailabilityFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const day = DateTime.fromObject(
      { year: 2030, month: 1, day: 17 },
      { zone: timezone },
    ).startOf("day");
    const dayIso = day.toISODate()!;
    const weekday = day.weekday % 7;

    const previewWithDraftRule = await call(
      availabilityRoutes.engine.previewTimes,
      {
        calendarId: calendar.id,
        startDate: dayIso,
        endDate: dayIso,
        timezone,
        draft: {
          weeklyRules: [
            {
              weekday,
              startTime: "09:00",
              endTime: "10:00",
            },
          ],
        },
      },
      { context: ctx },
    );

    expect(previewWithDraftRule.slots).toHaveLength(4);

    const previewWithDraftOverride = await call(
      availabilityRoutes.engine.previewTimes,
      {
        calendarId: calendar.id,
        startDate: dayIso,
        endDate: dayIso,
        timezone,
        draft: {
          weeklyRules: [
            {
              weekday,
              startTime: "09:00",
              endTime: "10:00",
            },
          ],
          dayOverrides: [
            {
              date: dayIso,
              timeRanges: [],
            },
          ],
        },
      },
      { context: ctx },
    );

    expect(previewWithDraftOverride.slots).toHaveLength(0);
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
          calendarId: calendar.id,
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

    const client = await createClient(db, org.id, {
      firstName: "Booked",
      lastName: "Client",
    });
    const bookedAppointment = await createAppointment(db, org.id, {
      calendarId: calendar.id,
      appointmentTypeId: appointmentType.id,
      clientId: client.id,
      startAt: slotStart,
      endAt: day
        .set({ hour: 10, minute: 0, second: 0, millisecond: 0 })
        .toJSDate(),
      timezone,
    });

    const unavailable = await call(
      availabilityRoutes.engine.check,
      {
        appointmentTypeId: appointmentType.id,
        calendarId: calendar.id,
        startTime: slotStart.toISOString(),
        timezone,
      },
      { context: ctx },
    );

    expect(unavailable.available).toBe(false);
    expect(unavailable.reason).toBe("SLOT_UNAVAILABLE");

    const excluded = await call(
      availabilityRoutes.engine.check,
      {
        appointmentTypeId: appointmentType.id,
        calendarId: calendar.id,
        excludeAppointmentId: bookedAppointment.id,
        startTime: slotStart.toISOString(),
        timezone,
      },
      { context: ctx },
    );

    expect(excluded.available).toBe(true);

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
