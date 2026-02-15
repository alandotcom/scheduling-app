import {
  describe,
  test,
  expect,
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
  getTestDb,
  } from "../test-utils/index.js";
import {
  defaultTimezone,
  getAvailabilityRoutes,
  type AvailabilityTestDb,
} from "../test-utils/availability-test-helpers.js";

describe("Availability Feed", () => {
  const db = getTestDb() as AvailabilityTestDb;

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
      timeRanges: [],
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
    const workingHoursItem = result.items.find(
      (item) => item.type === "working_hours",
    );
    const overrideClosedItem = result.items.find(
      (item) => item.type === "override_closed",
    );
    const blockedItem = result.items.find(
      (item) => item.type === "blocked_time",
    );

    expect(workingHoursItem).toBeDefined();
    expect(overrideClosedItem).toBeDefined();
    expect(blockedItem).toBeDefined();

    const expectedStart = day
      .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
      .toJSDate();
    const expectedEnd = day
      .set({ hour: 17, minute: 0, second: 0, millisecond: 0 })
      .toJSDate();

    expect(workingHoursItem?.startAt.getTime()).toBe(expectedStart.getTime());
    expect(workingHoursItem?.endAt.getTime()).toBe(expectedEnd.getTime());
    expect(workingHoursItem?.sourceId).toBe(rule.id);
    expect(overrideClosedItem?.sourceId).toBe(override.id);
    expect(blockedItem?.sourceId).toBe(blocked.id);
    expect(workingHoursItem?.label).toBe("Working hours");
    expect(overrideClosedItem?.label).toBe("Override (closed)");
    expect(blockedItem?.label).toBe("Blocked time");
  });
});
