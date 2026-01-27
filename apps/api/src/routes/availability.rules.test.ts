import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { call } from "@orpc/server";
import {
  createTestContext,
  createUnauthenticatedContext,
  createOrg,
  createCalendar,
  createAvailabilityRule,
  createTestDb,
  resetTestDb,
  closeTestDb,
} from "../test-utils/index.js";
import {
  createCalendarFixture,
  getAvailabilityRoutes,
  type AvailabilityTestDb,
} from "../test-utils/availability-test-helpers.js";

describe("Availability Rules", () => {
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

  test("returns empty list when no rules exist", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const result = await call(
      availabilityRoutes.rules.list,
      { calendarId: calendar.id, limit: 10 },
      { context: ctx },
    );

    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  test("returns rules for a calendar", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    await createAvailabilityRule(db, calendar.id, {
      weekday: 1,
      startTime: "09:00",
      endTime: "12:00",
    });
    await createAvailabilityRule(db, calendar.id, {
      weekday: 3,
      startTime: "13:00",
      endTime: "17:00",
    });

    const result = await call(
      availabilityRoutes.rules.list,
      { calendarId: calendar.id, limit: 10 },
      { context: ctx },
    );

    expect(result.items).toHaveLength(2);
    expect(result.items.map((rule) => rule.weekday).sort()).toEqual([1, 3]);
  });

  test("supports cursor pagination", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    await createAvailabilityRule(db, calendar.id, {
      weekday: 1,
      startTime: "09:00",
      endTime: "10:00",
    });
    await createAvailabilityRule(db, calendar.id, {
      weekday: 1,
      startTime: "10:00",
      endTime: "11:00",
    });
    await createAvailabilityRule(db, calendar.id, {
      weekday: 1,
      startTime: "11:00",
      endTime: "12:00",
    });

    const first = await call(
      availabilityRoutes.rules.list,
      { calendarId: calendar.id, limit: 2 },
      { context: ctx },
    );

    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeDefined();

    const second = await call(
      availabilityRoutes.rules.list,
      { calendarId: calendar.id, limit: 2, cursor: first.nextCursor! },
      { context: ctx },
    );

    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
  });

  test("rejects unauthenticated access", async () => {
    const { calendar } = await createCalendarFixture(db);
    const ctx = createUnauthenticatedContext();
    const availabilityRoutes = await getAvailabilityRoutes();

    await expect(
      call(
        availabilityRoutes.rules.list,
        { calendarId: calendar.id, limit: 10 },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
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
        availabilityRoutes.rules.list,
        { calendarId: calendar2.id, limit: 10 },
        { context: ctx1 },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("gets a rule by id", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const rule = await createAvailabilityRule(db, calendar.id, {
      weekday: 2,
      startTime: "08:00",
      endTime: "11:00",
    });

    const result = await call(
      availabilityRoutes.rules.get,
      { id: rule.id },
      { context: ctx },
    );

    expect(result.id).toBe(rule.id);
    expect(result.weekday).toBe(2);
  });

  test("throws NOT_FOUND for missing rule", async () => {
    const { org, user } = await createOrg(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    await expect(
      call(
        availabilityRoutes.rules.get,
        { id: "00000000-0000-0000-0000-000000000000" },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("creates a rule", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const result = await call(
      availabilityRoutes.rules.create,
      {
        calendarId: calendar.id,
        data: {
          weekday: 4,
          startTime: "09:00",
          endTime: "17:00",
        },
      },
      { context: ctx },
    );

    expect(result.calendarId).toBe(calendar.id);
    expect(result.weekday).toBe(4);
  });

  test("rejects overlapping rules", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    await createAvailabilityRule(db, calendar.id, {
      weekday: 1,
      startTime: "09:00",
      endTime: "12:00",
    });

    await expect(
      call(
        availabilityRoutes.rules.create,
        {
          calendarId: calendar.id,
          data: {
            weekday: 1,
            startTime: "11:00",
            endTime: "13:00",
          },
        },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("updates a rule", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const rule = await createAvailabilityRule(db, calendar.id, {
      weekday: 5,
      startTime: "09:00",
      endTime: "12:00",
    });

    const result = await call(
      availabilityRoutes.rules.update,
      { id: rule.id, data: { startTime: "10:00", endTime: "14:00" } },
      { context: ctx },
    );

    expect(result.startTime).toBe("10:00");
    expect(result.endTime).toBe("14:00");
  });

  test("rejects overlapping updates", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const rule1 = await createAvailabilityRule(db, calendar.id, {
      weekday: 2,
      startTime: "09:00",
      endTime: "11:00",
    });
    await createAvailabilityRule(db, calendar.id, {
      weekday: 2,
      startTime: "12:00",
      endTime: "14:00",
    });

    await expect(
      call(
        availabilityRoutes.rules.update,
        { id: rule1.id, data: { startTime: "10:30", endTime: "12:30" } },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("deletes a rule", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const rule = await createAvailabilityRule(db, calendar.id, {
      weekday: 0,
      startTime: "08:00",
      endTime: "09:00",
    });

    const result = await call(
      availabilityRoutes.rules.delete,
      { id: rule.id },
      { context: ctx },
    );

    expect(result.success).toBe(true);

    const list = await call(
      availabilityRoutes.rules.list,
      { calendarId: calendar.id, limit: 10 },
      { context: ctx },
    );

    expect(list.items).toHaveLength(0);
  });

  test("setWeeklyAvailability replaces existing rules", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    await createAvailabilityRule(db, calendar.id, {
      weekday: 1,
      startTime: "09:00",
      endTime: "12:00",
    });

    const result = await call(
      availabilityRoutes.rules.setWeekly,
      {
        calendarId: calendar.id,
        rules: [
          { weekday: 2, startTime: "10:00", endTime: "12:00" },
          { weekday: 4, startTime: "13:00", endTime: "15:00" },
        ],
      },
      { context: ctx },
    );

    expect(result.rules).toHaveLength(2);

    const list = await call(
      availabilityRoutes.rules.list,
      { calendarId: calendar.id, limit: 10 },
      { context: ctx },
    );

    expect(list.items).toHaveLength(2);
    expect(list.items.map((rule) => rule.weekday).sort()).toEqual([2, 4]);
  });

  test("setWeeklyAvailability rejects overlapping inputs", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    await expect(
      call(
        availabilityRoutes.rules.setWeekly,
        {
          calendarId: calendar.id,
          rules: [
            { weekday: 1, startTime: "09:00", endTime: "12:00" },
            { weekday: 1, startTime: "11:00", endTime: "13:00" },
          ],
        },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
