// Tests for availability routes - validates router registration
// Actual handler tests should be done through HTTP API integration tests

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
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

let db: Database;

beforeAll(async () => {
  db = (await createTestDb()) as Database;
});

afterAll(async () => {
  await closeTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

describe("Availability Routes Module", () => {
  test("availability routes module exists and exports correctly", async () => {
    // Dynamically import to avoid circular dependency issues
    const { availabilityRoutes } = await import("./availability.js");

    // Verify all route groups exist
    expect(availabilityRoutes).toBeDefined();
    expect(availabilityRoutes.rules).toBeDefined();
    expect(availabilityRoutes.overrides).toBeDefined();
    expect(availabilityRoutes.blockedTime).toBeDefined();
    expect(availabilityRoutes.schedulingLimits).toBeDefined();

    // Verify rules routes
    expect(availabilityRoutes.rules.list).toBeDefined();
    expect(availabilityRoutes.rules.get).toBeDefined();
    expect(availabilityRoutes.rules.create).toBeDefined();
    expect(availabilityRoutes.rules.update).toBeDefined();
    expect(availabilityRoutes.rules.delete).toBeDefined();
    expect(availabilityRoutes.rules.setWeekly).toBeDefined();

    // Verify overrides routes
    expect(availabilityRoutes.overrides.list).toBeDefined();
    expect(availabilityRoutes.overrides.get).toBeDefined();
    expect(availabilityRoutes.overrides.create).toBeDefined();
    expect(availabilityRoutes.overrides.update).toBeDefined();
    expect(availabilityRoutes.overrides.delete).toBeDefined();

    // Verify blocked time routes
    expect(availabilityRoutes.blockedTime.list).toBeDefined();
    expect(availabilityRoutes.blockedTime.get).toBeDefined();
    expect(availabilityRoutes.blockedTime.create).toBeDefined();
    expect(availabilityRoutes.blockedTime.update).toBeDefined();
    expect(availabilityRoutes.blockedTime.delete).toBeDefined();

    // Verify scheduling limits routes
    expect(availabilityRoutes.schedulingLimits.list).toBeDefined();
    expect(availabilityRoutes.schedulingLimits.get).toBeDefined();
    expect(availabilityRoutes.schedulingLimits.create).toBeDefined();
    expect(availabilityRoutes.schedulingLimits.update).toBeDefined();
    expect(availabilityRoutes.schedulingLimits.delete).toBeDefined();

    // Verify availability engine routes
    expect(availabilityRoutes.engine).toBeDefined();
    expect(availabilityRoutes.engine.dates).toBeDefined();
    expect(availabilityRoutes.engine.times).toBeDefined();
    expect(availabilityRoutes.engine.check).toBeDefined();
  });

  test("main router includes availability routes", async () => {
    // This verifies the router is properly composed
    const { router } = await import("./index.js");

    expect(router).toBeDefined();
    expect(router.availability).toBeDefined();
    expect(router.availability.rules).toBeDefined();
    expect(router.availability.overrides).toBeDefined();
    expect(router.availability.blockedTime).toBeDefined();
    expect(router.availability.schedulingLimits).toBeDefined();
    expect(router.availability.engine).toBeDefined();
  });
});

describe("Availability Feed", () => {
  test("returns rules, overrides, and blocked time in range", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });

    const calendar = await createCalendar(db, org.id, {
      name: "Feed Calendar",
      timezone: "America/New_York",
    });

    const timezone = "America/New_York";
    const day = DateTime.now()
      .setZone(timezone)
      .plus({ days: 2 })
      .startOf("day");
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

    const { availabilityRoutes } = await import("./availability.js");
    const result = await call(
      availabilityRoutes.feed,
      {
        calendarIds: [calendar.id],
        startAt: rangeStart,
        endAt: rangeEnd,
        timezone,
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
