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
  createOrg,
  createCalendar,
  createTestDb,
  resetTestDb,
  closeTestDb,
} from "../test-utils/index.js";
import {
  createCalendarFixture,
  getAvailabilityRoutes,
  type AvailabilityTestDb,
} from "../test-utils/availability-test-helpers.js";

describe("Scheduling Limits", () => {
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

  test("creates, lists, gets, updates, and deletes limits", async () => {
    const { org, user, calendar } = await createCalendarFixture(db);
    const ctx = createTestContext({ orgId: org.id, userId: user.id });
    const availabilityRoutes = await getAvailabilityRoutes();

    const created = await call(
      availabilityRoutes.schedulingLimits.create,
      {
        data: {
          calendarId: calendar.id,
          minNoticeHours: 2,
          maxNoticeDays: 30,
        },
      },
      { context: ctx },
    );

    const list = await call(
      availabilityRoutes.schedulingLimits.list,
      { calendarId: calendar.id, limit: 10 },
      { context: ctx },
    );

    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.id).toBe(created.id);

    const fetched = await call(
      availabilityRoutes.schedulingLimits.get,
      { id: created.id },
      { context: ctx },
    );

    expect(fetched.minNoticeHours).toBe(2);

    const updated = await call(
      availabilityRoutes.schedulingLimits.update,
      { id: created.id, data: { maxPerDay: 3 } },
      { context: ctx },
    );

    expect(updated.maxPerDay).toBe(3);

    const removed = await call(
      availabilityRoutes.schedulingLimits.delete,
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
        availabilityRoutes.schedulingLimits.create,
        { data: { calendarId: calendar2.id, minNoticeHours: 1 } },
        { context: ctx1 },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
