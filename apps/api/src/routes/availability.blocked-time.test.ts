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
  createTestDb,
  resetTestDb,
  closeTestDb,
} from "../test-utils/index.js";
import {
  createCalendarFixture,
  getAvailabilityRoutes,
  defaultTimezone,
  type AvailabilityTestDb,
} from "../test-utils/availability-test-helpers.js";

describe("Blocked Time", () => {
  let db: AvailabilityTestDb;

  beforeAll(async () => {
    db = (await createTestDb()) as AvailabilityTestDb;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  test("creates blocked time with string inputs", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const day = DateTime.fromObject(
      { year: 2030, month: 3, day: 1 },
      { zone: defaultTimezone },
    ).startOf("day");
    const startAt = day
      .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
      .toJSDate();
    const endAt = DateTime.fromJSDate(startAt).plus({ hours: 2 }).toJSDate();

    const created = await call(
      availabilityRoutes.blockedTime.create,
      {
        calendarId: calendar.id,
        data: {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        },
      },
      { context: ctx },
    );

    expect(created.startAt.getTime()).toBe(startAt.getTime());
    expect(created.endAt.getTime()).toBe(endAt.getTime());

    const list = await call(
      availabilityRoutes.blockedTime.list,
      { calendarId: calendar.id, limit: 10 },
      { context: ctx },
    );

    expect(list.items).toHaveLength(1);

    const fetched = await call(
      availabilityRoutes.blockedTime.get,
      { id: created.id },
      { context: ctx },
    );

    expect(fetched.id).toBe(created.id);
  });

  test("updates blocked time with partial fields", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const day = DateTime.fromObject(
      { year: 2030, month: 3, day: 2 },
      { zone: defaultTimezone },
    ).startOf("day");
    const startAt = day
      .set({ hour: 8, minute: 0, second: 0, millisecond: 0 })
      .toJSDate();
    const endAt = DateTime.fromJSDate(startAt).plus({ hours: 1 }).toJSDate();

    const created = await call(
      availabilityRoutes.blockedTime.create,
      {
        calendarId: calendar.id,
        data: {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        },
      },
      { context: ctx },
    );

    const updatedEnd = DateTime.fromJSDate(endAt).plus({ hours: 1 }).toJSDate();
    const updated = await call(
      availabilityRoutes.blockedTime.update,
      {
        id: created.id,
        data: {
          endAt: updatedEnd.toISOString(),
          recurringRule: "FREQ=DAILY;COUNT=2",
        },
      },
      { context: ctx },
    );

    expect(updated.endAt.getTime()).toBe(updatedEnd.getTime());
    expect(updated.recurringRule).toBe("FREQ=DAILY;COUNT=2");
  });

  test("deletes blocked time", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const day = DateTime.fromObject(
      { year: 2030, month: 3, day: 3 },
      { zone: defaultTimezone },
    ).startOf("day");
    const startAt = day
      .set({ hour: 15, minute: 0, second: 0, millisecond: 0 })
      .toJSDate();
    const endAt = DateTime.fromJSDate(startAt).plus({ hours: 1 }).toJSDate();

    const created = await call(
      availabilityRoutes.blockedTime.create,
      {
        calendarId: calendar.id,
        data: {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        },
      },
      { context: ctx },
    );

    const removed = await call(
      availabilityRoutes.blockedTime.delete,
      { id: created.id },
      { context: ctx },
    );

    expect(removed.success).toBe(true);
  });

  test("rejects calendars from another org", async () => {
    const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
    const { org: org2 } = await createOrg(db, { name: "Org 2" });
    const calendar2 = await createCalendar(db, org2.id, {
      name: "Org 2 Calendar",
    });
    const ctx1 = createTestContext({ orgId: org1.id, userId: user1.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    await expect(
      call(
        availabilityRoutes.blockedTime.list,
        { calendarId: calendar2.id, limit: 10 },
        { context: ctx1 },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
