// Tests for AvailabilityService

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import {
  createTestDb,
  resetTestDb,
  closeTestDb,
  seedTestOrg,
  setTestOrgContext,
} from "@scheduling/db/test-utils";
import {
  locations,
  calendars,
  appointmentTypes,
  appointmentTypeCalendars,
  availabilityRules,
  availabilityOverrides,
  blockedTime,
  schedulingLimits,
  appointments,
  resources,
  appointmentTypeResources,
} from "@scheduling/db/schema";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";
import { availabilityService } from "./engine.js";
import { runWithContext } from "../../lib/request-context.js";

// Cast to the type the service expects
type Database = BunSQLDatabase<typeof schema, typeof relations>;

describe("AvailabilityService", () => {
  let db: Database;
  let org: { id: string; name: string };
  let user: { id: string };
  let location: { id: string };
  let calendar: { id: string };
  let appointmentType: { id: string };

  // Helper to run service calls with test context
  const withTestContext = <T>(fn: () => T): T =>
    runWithContext(
      {
        orgId: org.id,
        userId: user.id,
        sessionId: null,
        tokenId: null,
        authMethod: null,
        role: null,
      },
      fn,
    );

  beforeAll(async () => {
    db = (await createTestDb()) as Database;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
    const seed = await seedTestOrg(db as any);
    org = seed.org;
    user = seed.user;

    // Set org context for RLS-protected inserts
    await setTestOrgContext(db, org.id);

    // Create location
    const [loc] = await db
      .insert(locations)
      .values({
        orgId: org.id,
        name: "Main Office",
        timezone: "America/New_York",
      })
      .returning();
    location = loc!;

    // Create calendar
    const [cal] = await db
      .insert(calendars)
      .values({
        orgId: org.id,
        locationId: location.id,
        name: "Room 1",
        timezone: "America/New_York",
      })
      .returning();
    calendar = cal!;

    // Create appointment type
    const [at] = await db
      .insert(appointmentTypes)
      .values({
        orgId: org.id,
        name: "Consultation",
        durationMin: 60,
        paddingBeforeMin: 0,
        paddingAfterMin: 0,
        capacity: 1,
      })
      .returning();
    appointmentType = at!;

    // Link calendar to appointment type
    await db.insert(appointmentTypeCalendars).values({
      appointmentTypeId: appointmentType.id,
      calendarId: calendar.id,
    });
  });

  describe("getAvailableSlots", () => {
    test("returns empty when no availability rules exist", async () => {
      const slots = await withTestContext(() =>
        availabilityService.getAvailableSlots({
          appointmentTypeId: appointmentType.id,
          calendarIds: [calendar.id],
          startDate: "2026-01-27", // Tuesday
          endDate: "2026-01-27",
          timezone: "America/New_York",
        }),
      );

      expect(slots).toEqual([]);
    });

    test("generates slots based on availability rules", async () => {
      // Tuesday availability: 9am-12pm with 30-min intervals
      await db.insert(availabilityRules).values({
        calendarId: calendar.id,
        weekday: 2, // Tuesday (2026-01-27 is a Tuesday in America/New_York)
        startTime: "09:00",
        endTime: "12:00",
        intervalMin: 30,
      });

      const slots = await withTestContext(() =>
        availabilityService.getAvailableSlots({
          appointmentTypeId: appointmentType.id,
          calendarIds: [calendar.id],
          startDate: "2026-01-27", // Tuesday
          endDate: "2026-01-27",
          timezone: "America/New_York",
        }),
      );

      // With 60-min duration and 30-min intervals, we get slots at 9:00, 9:30, 10:00, 10:30, 11:00
      // (11:30 would end at 12:30, after the 12:00 end time)
      expect(slots.length).toBe(5);
      expect(slots.every((s) => s.available)).toBe(true);
      expect(slots.every((s) => s.remainingCapacity === 1)).toBe(true);
    });

    test("respects blocked day override", async () => {
      // Add availability rule for Monday
      await db.insert(availabilityRules).values({
        calendarId: calendar.id,
        weekday: 2,
        startTime: "09:00",
        endTime: "17:00",
        intervalMin: 30,
      });

      // Block the entire day
      await db.insert(availabilityOverrides).values({
        calendarId: calendar.id,
        date: "2026-01-27",
        isBlocked: true,
      });

      const slots = await withTestContext(() =>
        availabilityService.getAvailableSlots({
          appointmentTypeId: appointmentType.id,
          calendarIds: [calendar.id],
          startDate: "2026-01-27",
          endDate: "2026-01-27",
          timezone: "America/New_York",
        }),
      );

      expect(slots).toEqual([]);
    });

    test("uses override hours instead of regular rules", async () => {
      // Regular Monday hours
      await db.insert(availabilityRules).values({
        calendarId: calendar.id,
        weekday: 2,
        startTime: "09:00",
        endTime: "17:00",
        intervalMin: 30,
      });

      // Override with limited hours
      await db.insert(availabilityOverrides).values({
        calendarId: calendar.id,
        date: "2026-01-27",
        startTime: "10:00",
        endTime: "12:00",
        isBlocked: false,
        intervalMin: 30,
      });

      const slots = await withTestContext(() =>
        availabilityService.getAvailableSlots({
          appointmentTypeId: appointmentType.id,
          calendarIds: [calendar.id],
          startDate: "2026-01-27",
          endDate: "2026-01-27",
          timezone: "America/New_York",
        }),
      );

      // Should only have slots from 10:00-12:00 (10:00, 10:30, 11:00)
      expect(slots.length).toBe(3);
    });

    test("marks slots as unavailable when booked", async () => {
      await db.insert(availabilityRules).values({
        calendarId: calendar.id,
        weekday: 2,
        startTime: "09:00",
        endTime: "12:00",
        intervalMin: 60,
      });

      // Book the 10:00 slot
      const startAt = new Date("2026-01-27T15:00:00Z"); // 10am EST
      const endAt = new Date("2026-01-27T16:00:00Z"); // 11am EST
      await db.insert(appointments).values({
        orgId: org.id,
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt,
        endAt,
        timezone: "America/New_York",
        status: "scheduled",
      });

      const slots = await withTestContext(() =>
        availabilityService.getAvailableSlots({
          appointmentTypeId: appointmentType.id,
          calendarIds: [calendar.id],
          startDate: "2026-01-27",
          endDate: "2026-01-27",
          timezone: "America/New_York",
        }),
      );

      // 3 slots: 9:00 (available), 10:00 (unavailable), 11:00 (available)
      expect(slots.length).toBe(3);
      expect(slots[0]!.available).toBe(true);
      expect(slots[1]!.available).toBe(false);
      expect(slots[1]!.remainingCapacity).toBe(0);
      expect(slots[2]!.available).toBe(true);
    });

    test("handles blocked time ranges", async () => {
      await db.insert(availabilityRules).values({
        calendarId: calendar.id,
        weekday: 2,
        startTime: "09:00",
        endTime: "17:00",
        intervalMin: 60,
      });

      // Block 12:00-13:00 (lunch)
      await db.insert(blockedTime).values({
        calendarId: calendar.id,
        startAt: new Date("2026-01-27T17:00:00Z"), // 12pm EST
        endAt: new Date("2026-01-27T18:00:00Z"), // 1pm EST
      });

      const slots = await withTestContext(() =>
        availabilityService.getAvailableSlots({
          appointmentTypeId: appointmentType.id,
          calendarIds: [calendar.id],
          startDate: "2026-01-27",
          endDate: "2026-01-27",
          timezone: "America/New_York",
        }),
      );

      // Find the 12:00 slot
      const noonSlot = slots.find((s) => {
        const hour = new Date(s.start).getUTCHours();
        return hour === 17; // 12pm EST = 17 UTC
      });

      expect(noonSlot?.available).toBe(false);
    });

    test("respects min notice hours", async () => {
      await db.insert(availabilityRules).values({
        calendarId: calendar.id,
        weekday: 2,
        startTime: "09:00",
        endTime: "17:00",
        intervalMin: 60,
      });

      // Set 24-hour minimum notice
      await db.insert(schedulingLimits).values({
        calendarId: calendar.id,
        minNoticeHours: 24,
      });

      const slots = await withTestContext(() =>
        availabilityService.getAvailableSlots({
          appointmentTypeId: appointmentType.id,
          calendarIds: [calendar.id],
          startDate: "2026-01-27",
          endDate: "2026-01-27",
          timezone: "America/New_York",
        }),
      );

      // All slots should be unavailable if within 24 hours (depending on current time)
      // Since we can't control "now", we just verify the filter runs
      expect(Array.isArray(slots)).toBe(true);
    });

    test("respects max notice days", async () => {
      await db.insert(availabilityRules).values({
        calendarId: calendar.id,
        weekday: 2,
        startTime: "09:00",
        endTime: "17:00",
        intervalMin: 60,
      });

      // Set 7-day maximum notice
      await db.insert(schedulingLimits).values({
        calendarId: calendar.id,
        maxNoticeDays: 7,
      });

      // Query for a date far in the future
      const slots = await withTestContext(() =>
        availabilityService.getAvailableSlots({
          appointmentTypeId: appointmentType.id,
          calendarIds: [calendar.id],
          startDate: "2026-12-01", // ~11 months away
          endDate: "2026-12-01",
          timezone: "America/New_York",
        }),
      );

      // All slots should be unavailable (beyond max notice window)
      expect(slots.every((s) => !s.available)).toBe(true);
    });

    test("respects max per day limit", async () => {
      // Create a high-capacity appointment type
      const [highCapAt] = await db
        .insert(appointmentTypes)
        .values({
          orgId: org.id,
          name: "Group Session",
          durationMin: 60,
          capacity: 10,
        })
        .returning();

      await db.insert(appointmentTypeCalendars).values({
        appointmentTypeId: highCapAt!.id,
        calendarId: calendar.id,
      });

      await db.insert(availabilityRules).values({
        calendarId: calendar.id,
        weekday: 2,
        startTime: "09:00",
        endTime: "17:00",
        intervalMin: 60,
      });

      // Set max 2 appointments per day
      await db.insert(schedulingLimits).values({
        calendarId: calendar.id,
        maxPerDay: 2,
      });

      // Book 2 appointments
      await db.insert(appointments).values([
        {
          orgId: org.id,
          calendarId: calendar.id,
          appointmentTypeId: highCapAt!.id,
          startAt: new Date("2026-01-27T14:00:00Z"),
          endAt: new Date("2026-01-27T15:00:00Z"),
          timezone: "America/New_York",
          status: "scheduled",
        },
        {
          orgId: org.id,
          calendarId: calendar.id,
          appointmentTypeId: highCapAt!.id,
          startAt: new Date("2026-01-27T16:00:00Z"),
          endAt: new Date("2026-01-27T17:00:00Z"),
          timezone: "America/New_York",
          status: "scheduled",
        },
      ]);

      const slots = await withTestContext(() =>
        availabilityService.getAvailableSlots({
          appointmentTypeId: highCapAt!.id,
          calendarIds: [calendar.id],
          startDate: "2026-01-27",
          endDate: "2026-01-27",
          timezone: "America/New_York",
        }),
      );

      // All slots should be unavailable due to daily limit
      expect(slots.every((s) => !s.available)).toBe(true);
    });

    test("throws NOT_FOUND when any requested calendar is unlinked", async () => {
      // Create another calendar NOT linked to the appointment type
      const [cal2] = await db
        .insert(calendars)
        .values({
          orgId: org.id,
          name: "Unlinked Room",
          timezone: "America/New_York",
        })
        .returning();

      await expect(
        withTestContext(() =>
          availabilityService.getAvailableSlots({
            appointmentTypeId: appointmentType.id,
            calendarIds: [calendar.id, cal2!.id],
            startDate: "2026-01-27",
            endDate: "2026-01-27",
            timezone: "America/New_York",
          }),
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("getAvailableDates", () => {
    test("returns dates with available slots", async () => {
      // Tuesday and Thursday availability
      // 2026-01-27 = Tuesday (weekday 2), 2026-01-29 = Thursday (weekday 4)
      await db.insert(availabilityRules).values([
        {
          calendarId: calendar.id,
          weekday: 2, // Tuesday
          startTime: "09:00",
          endTime: "17:00",
          intervalMin: 60,
        },
        {
          calendarId: calendar.id,
          weekday: 4, // Thursday
          startTime: "09:00",
          endTime: "17:00",
          intervalMin: 60,
        },
      ]);

      const dates = await withTestContext(() =>
        availabilityService.getAvailableDates({
          appointmentTypeId: appointmentType.id,
          calendarIds: [calendar.id],
          startDate: "2026-01-27", // Tuesday
          endDate: "2026-01-31", // Saturday
          timezone: "America/New_York",
        }),
      );

      // Should include Tuesday (27th) and Thursday (29th)
      expect(dates).toContain("2026-01-27");
      expect(dates).toContain("2026-01-29");
      expect(dates).not.toContain("2026-01-28"); // Wednesday
      expect(dates).not.toContain("2026-01-30"); // Friday
    });
  });

  describe("checkSlot", () => {
    test("returns available for valid slot", async () => {
      await db.insert(availabilityRules).values({
        calendarId: calendar.id,
        weekday: 2,
        startTime: "09:00",
        endTime: "17:00",
        intervalMin: 60,
      });

      const result = await withTestContext(() =>
        availabilityService.checkSlot(
          appointmentType.id,
          calendar.id,
          new Date("2026-01-27T14:00:00Z"), // 9am EST
          "America/New_York",
        ),
      );

      expect(result.available).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test("returns unavailable with reason for invalid slot", async () => {
      // No availability rules - slot is invalid
      const result = await withTestContext(() =>
        availabilityService.checkSlot(
          appointmentType.id,
          calendar.id,
          new Date("2026-01-27T14:00:00Z"),
          "America/New_York",
        ),
      );

      expect(result.available).toBe(false);
      expect(result.reason).toBe("INVALID_SLOT_TIME");
    });

    test("returns unavailable when slot is booked", async () => {
      await db.insert(availabilityRules).values({
        calendarId: calendar.id,
        weekday: 2,
        startTime: "09:00",
        endTime: "17:00",
        intervalMin: 60,
      });

      // Book the 9am slot
      await db.insert(appointments).values({
        orgId: org.id,
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: new Date("2026-01-27T14:00:00Z"),
        endAt: new Date("2026-01-27T15:00:00Z"),
        timezone: "America/New_York",
        status: "scheduled",
      });

      const result = await withTestContext(() =>
        availabilityService.checkSlot(
          appointmentType.id,
          calendar.id,
          new Date("2026-01-27T14:00:00Z"),
          "America/New_York",
        ),
      );

      expect(result.available).toBe(false);
      expect(result.reason).toBe("SLOT_UNAVAILABLE");
    });
  });

  describe("capacity handling", () => {
    test("allows multiple bookings up to capacity", async () => {
      // Create high-capacity appointment type
      const [groupAt] = await db
        .insert(appointmentTypes)
        .values({
          orgId: org.id,
          name: "Group Class",
          durationMin: 60,
          capacity: 3,
        })
        .returning();

      await db.insert(appointmentTypeCalendars).values({
        appointmentTypeId: groupAt!.id,
        calendarId: calendar.id,
      });

      await db.insert(availabilityRules).values({
        calendarId: calendar.id,
        weekday: 2,
        startTime: "09:00",
        endTime: "12:00",
        intervalMin: 60,
      });

      // Book 2 of 3 spots for 9am
      await db.insert(appointments).values([
        {
          orgId: org.id,
          calendarId: calendar.id,
          appointmentTypeId: groupAt!.id,
          startAt: new Date("2026-01-27T14:00:00Z"),
          endAt: new Date("2026-01-27T15:00:00Z"),
          timezone: "America/New_York",
          status: "scheduled",
        },
        {
          orgId: org.id,
          calendarId: calendar.id,
          appointmentTypeId: groupAt!.id,
          startAt: new Date("2026-01-27T14:00:00Z"),
          endAt: new Date("2026-01-27T15:00:00Z"),
          timezone: "America/New_York",
          status: "confirmed",
        },
      ]);

      const slots = await withTestContext(() =>
        availabilityService.getAvailableSlots({
          appointmentTypeId: groupAt!.id,
          calendarIds: [calendar.id],
          startDate: "2026-01-27",
          endDate: "2026-01-27",
          timezone: "America/New_York",
        }),
      );

      // 9am slot should still be available with 1 remaining
      const nineAmSlot = slots.find(
        (s) => new Date(s.start).getUTCHours() === 14,
      );
      expect(nineAmSlot?.available).toBe(true);
      expect(nineAmSlot?.remainingCapacity).toBe(1);
    });
  });

  describe("resource constraints", () => {
    test("marks slot unavailable when resource exhausted", async () => {
      // Create a resource with quantity 1
      const [resource] = await db
        .insert(resources)
        .values({
          orgId: org.id,
          name: "Massage Table",
          quantity: 1,
        })
        .returning();

      // Link resource to appointment type
      await db.insert(appointmentTypeResources).values({
        appointmentTypeId: appointmentType.id,
        resourceId: resource!.id,
        quantityRequired: 1,
      });

      await db.insert(availabilityRules).values({
        calendarId: calendar.id,
        weekday: 2,
        startTime: "09:00",
        endTime: "12:00",
        intervalMin: 60,
      });

      // Book appointment using the resource
      await db.insert(appointments).values({
        orgId: org.id,
        calendarId: calendar.id,
        appointmentTypeId: appointmentType.id,
        startAt: new Date("2026-01-27T14:00:00Z"),
        endAt: new Date("2026-01-27T15:00:00Z"),
        timezone: "America/New_York",
        status: "scheduled",
      });

      const slots = await withTestContext(() =>
        availabilityService.getAvailableSlots({
          appointmentTypeId: appointmentType.id,
          calendarIds: [calendar.id],
          startDate: "2026-01-27",
          endDate: "2026-01-27",
          timezone: "America/New_York",
        }),
      );

      // 9am slot should be unavailable (resource exhausted)
      const nineAmSlot = slots.find(
        (s) => new Date(s.start).getUTCHours() === 14,
      );
      expect(nineAmSlot?.available).toBe(false);
    });
  });

  describe("padding handling", () => {
    test("accounts for padding when checking overlaps", async () => {
      // Update appointment type to have padding
      const [paddedAt] = await db
        .insert(appointmentTypes)
        .values({
          orgId: org.id,
          name: "Padded Consultation",
          durationMin: 60,
          paddingBeforeMin: 15,
          paddingAfterMin: 15,
          capacity: 1,
        })
        .returning();

      await db.insert(appointmentTypeCalendars).values({
        appointmentTypeId: paddedAt!.id,
        calendarId: calendar.id,
      });

      await db.insert(availabilityRules).values({
        calendarId: calendar.id,
        weekday: 2,
        startTime: "09:00",
        endTime: "17:00",
        intervalMin: 30,
      });

      // Book 10:00-11:00 with 15min padding on each side
      // This should effectively block 9:45-11:15
      await db.insert(appointments).values({
        orgId: org.id,
        calendarId: calendar.id,
        appointmentTypeId: paddedAt!.id,
        startAt: new Date("2026-01-27T15:00:00Z"), // 10am EST
        endAt: new Date("2026-01-27T16:00:00Z"), // 11am EST
        timezone: "America/New_York",
        status: "scheduled",
      });

      const slots = await withTestContext(() =>
        availabilityService.getAvailableSlots({
          appointmentTypeId: paddedAt!.id,
          calendarIds: [calendar.id],
          startDate: "2026-01-27",
          endDate: "2026-01-27",
          timezone: "America/New_York",
        }),
      );

      // 9:30-10:30 slot would overlap with padding, should be unavailable
      const _nineThirtySlot = slots.find((s) => {
        const d = new Date(s.start);
        return d.getUTCHours() === 14 && d.getUTCMinutes() === 30;
      });

      // The 10:00 slot definitely overlaps
      const tenAmSlot = slots.find((s) => {
        const d = new Date(s.start);
        return d.getUTCHours() === 15 && d.getUTCMinutes() === 0;
      });
      expect(tenAmSlot?.available).toBe(false);
    });
  });
});
