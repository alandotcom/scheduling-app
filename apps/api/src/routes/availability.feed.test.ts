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
  createAvailabilityRule,
  createAvailabilityOverride,
  createBlockedTime,
  createTestDb,
  resetTestDb,
  closeTestDb,
} from "../test-utils/index.js";
import {
  defaultTimezone,
  getAvailabilityRoutes,
  type AvailabilityTestDb,
} from "../test-utils/availability-test-helpers.js";

describe("Availability Feed", () => {
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

  test("returns rules, overrides, and blocked time in range", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    const calendar = await createCalendar(db, org.id, {
      name: "Feed Calendar",
      timezone: defaultTimezone,
    });

    const day = DateTime.fromObject(
      { year: 2030, month: 1, day: 15 },
      { zone: defaultTimezone },
    ).startOf("day");
    const weekday = day.weekday % 7;

    const rule = await createAvailabilityRule(db, calendar.id, {
      weekday,
      startTime: "09:00",
      endTime: "17:00",
    });
    const override = await createAvailabilityOverride(db, calendar.id, {
      date: day.toISODate()!,
      isBlocked: true,
      startTime: "12:00",
      endTime: "14:00",
    });
    const blockedStart = day
      .set({ hour: 15, minute: 0, second: 0, millisecond: 0 })
      .toJSDate();
    const blockedEnd = day
      .set({ hour: 16, minute: 0, second: 0, millisecond: 0 })
      .toJSDate();
    const blocked = await createBlockedTime(db, calendar.id, {
      startAt: blockedStart,
      endAt: blockedEnd,
    });

    const rangeStart = day.startOf("day").toJSDate();
    const rangeEnd = day.endOf("day").toJSDate();

    const availabilityRoutes = await getAvailabilityRoutes();
    const result = await call(
      availabilityRoutes.feed,
      {
        calendarIds: [calendar.id],
        startAt: rangeStart,
        endAt: rangeEnd,
        timezone: defaultTimezone,
      },
      { context: ctx },
    );

    expect(result.items).toHaveLength(3);
    expect(result.items[0]?.type).toBe("working_hours");
    expect(result.items[1]?.type).toBe("override_closed");
    expect(result.items[2]?.type).toBe("blocked_time");

    const expectedStart = day
      .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
      .toJSDate();
    const expectedEnd = day
      .set({ hour: 17, minute: 0, second: 0, millisecond: 0 })
      .toJSDate();

    expect(result.items[0]?.startAt.getTime()).toBe(expectedStart.getTime());
    expect(result.items[0]?.endAt.getTime()).toBe(expectedEnd.getTime());
    expect(result.items[0]?.sourceId).toBe(rule.id);
    expect(result.items[1]?.sourceId).toBe(override.id);
    expect(result.items[2]?.sourceId).toBe(blocked.id);
    expect(result.items[0]?.label).toBe("Working hours");
    expect(result.items[1]?.label).toBe("Override (closed)");
    expect(result.items[2]?.label).toBe("Blocked time");
  });
});
