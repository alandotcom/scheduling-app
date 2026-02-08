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

describe("Availability Overrides", () => {
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

  test("creates, lists, and gets overrides", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const date = DateTime.fromObject(
      { year: 2030, month: 2, day: 10 },
      { zone: defaultTimezone },
    ).toISODate()!;

    const created = await call(
      availabilityRoutes.overrides.create,
      {
        calendarId: calendar.id,
        data: {
          date,
          timeRanges: [{ startTime: "10:00", endTime: "12:00" }],
        },
      },
      { context: ctx },
    );

    const list = await call(
      availabilityRoutes.overrides.list,
      { calendarId: calendar.id, limit: 10 },
      { context: ctx },
    );

    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.date).toBe(date);

    const fetched = await call(
      availabilityRoutes.overrides.get,
      { id: created.id },
      { context: ctx },
    );

    expect(fetched.id).toBe(created.id);
    expect(fetched.timeRanges).toEqual([
      { startTime: "10:00", endTime: "12:00" },
    ]);
  });

  test("rejects duplicate overrides for the same date", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const date = DateTime.fromObject(
      { year: 2030, month: 2, day: 12 },
      { zone: defaultTimezone },
    ).toISODate()!;

    await call(
      availabilityRoutes.overrides.create,
      {
        calendarId: calendar.id,
        data: { date, timeRanges: [{ startTime: "09:00", endTime: "10:00" }] },
      },
      { context: ctx },
    );

    await expect(
      call(
        availabilityRoutes.overrides.create,
        {
          calendarId: calendar.id,
          data: {
            date,
            timeRanges: [{ startTime: "11:00", endTime: "12:00" }],
          },
        },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("updates and deletes overrides", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const date = DateTime.fromObject(
      { year: 2030, month: 2, day: 15 },
      { zone: defaultTimezone },
    ).toISODate()!;

    const created = await call(
      availabilityRoutes.overrides.create,
      {
        calendarId: calendar.id,
        data: { date, timeRanges: [{ startTime: "09:00", endTime: "11:00" }] },
      },
      { context: ctx },
    );

    const updated = await call(
      availabilityRoutes.overrides.update,
      {
        id: created.id,
        data: { timeRanges: [] },
      },
      { context: ctx },
    );

    expect(updated.timeRanges).toEqual([]);

    const removed = await call(
      availabilityRoutes.overrides.delete,
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
        availabilityRoutes.overrides.list,
        { calendarId: calendar2.id, limit: 10 },
        { context: ctx1 },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
