import { describe, test, expect } from "bun:test";
import { call } from "@orpc/server";
import {
  createOrg,
  createCalendar,
  createTestContext,
  getTestDb,
  registerDbTestReset,
} from "../test-utils/index.js";
import {
  createCalendarFixture,
  type AvailabilityTestDb,
} from "../test-utils/availability-test-helpers.js";
import { calendarRoutes } from "./calendars.js";
import { orgRoutes } from "./orgs.js";

describe("Scheduling Limits Routes", () => {
  registerDbTestReset("per-file");
  const db = getTestDb() as AvailabilityTestDb;

  test("upserts and fetches org defaults", async () => {
    const { org, user } = await createOrg(db, { name: "Org A" });
    const ctx = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "admin",
    });

    const created = await call(
      orgRoutes.settings.schedulingLimits.upsert,
      {
        data: {
          minNoticeMinutes: 15,
          maxNoticeDays: 45,
        },
      },
      { context: ctx },
    );

    expect(created.calendarId).toBeNull();
    expect(created.minNoticeMinutes).toBe(15);
    expect(created.maxNoticeDays).toBe(45);

    const updated = await call(
      orgRoutes.settings.schedulingLimits.upsert,
      { data: { minNoticeMinutes: 12 } },
      { context: ctx },
    );

    expect(updated.id).toBe(created.id);
    expect(updated.minNoticeMinutes).toBe(12);
    expect(updated.maxNoticeDays).toBe(45);

    const fetched = await call(
      orgRoutes.settings.schedulingLimits.get,
      {},
      { context: ctx },
    );
    expect(fetched?.id).toBe(created.id);
  });

  test("upserts and fetches calendar overrides", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "admin",
    });

    const created = await call(
      calendarRoutes.schedulingLimits.upsert,
      {
        calendarId: calendar.id,
        data: {
          maxNoticeDays: 10,
          maxPerDay: 5,
        },
      },
      { context: ctx },
    );

    expect(created.calendarId).toBe(calendar.id);
    expect(created.maxNoticeDays).toBe(10);
    expect(created.maxPerDay).toBe(5);

    const updated = await call(
      calendarRoutes.schedulingLimits.upsert,
      {
        calendarId: calendar.id,
        data: {
          maxNoticeDays: null,
        },
      },
      { context: ctx },
    );

    expect(updated.id).toBe(created.id);
    expect(updated.maxNoticeDays).toBeNull();
    expect(updated.maxPerDay).toBe(5);

    const fetched = await call(
      calendarRoutes.schedulingLimits.get,
      { calendarId: calendar.id },
      { context: ctx },
    );
    expect(fetched?.id).toBe(created.id);
  });

  test("calendar get returns null when no override exists", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({
      orgId: org.id,
      userId: user.id,
      role: "admin",
    });

    const result = await call(
      calendarRoutes.schedulingLimits.get,
      { calendarId: calendar.id },
      { context: ctx },
    );

    expect(result).toBeNull();
  });

  test("rejects calendars from another org", async () => {
    const { org: org1, user: user1 } = await createOrg(db, { name: "Org 1" });
    const { org: org2 } = await createOrg(db, { name: "Org 2" });
    const calendar2 = await createCalendar(db, org2.id, {
      name: "Org 2 Calendar",
    });

    const ctx = createTestContext({
      orgId: org1.id,
      userId: user1.id,
      role: "admin",
    });

    await expect(
      call(
        calendarRoutes.schedulingLimits.upsert,
        { calendarId: calendar2.id, data: { minNoticeMinutes: 1 } },
        { context: ctx },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
