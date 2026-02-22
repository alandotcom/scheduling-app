// Test data factories for creating realistic test fixtures
//
// These factories build on the base seedTestOrg from @scheduling/db/test-utils
// and add higher-level helpers for creating related entities.
//
// All factories that insert into RLS-protected tables automatically set
// the org context before inserting.

import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";
import {
  orgs,
  users,
  orgMemberships,
  locations,
  calendars,
  appointmentTypes,
  appointmentTypeCalendars,
  resources,
  appointmentTypeResources,
  clients,
  appointments,
  availabilityRules,
  availabilityOverrides,
  blockedTime,
  schedulingLimits,
} from "@scheduling/db/schema";
import {
  setTestOrgContext,
  clearTestOrgContext,
} from "@scheduling/db/test-utils";
import { createTestContext } from "./context.js";

type Database = BunSQLDatabase<typeof schema, typeof relations>;

// Counter to ensure unique emails within the same millisecond
let orgCounter = 0;

/**
 * Create an organization with an admin user
 * Note: orgs and users are NOT RLS-protected, but org_memberships IS RLS-protected
 */
export async function createOrg(
  db: Database,
  options: { name?: string; email?: string; userName?: string } = {},
) {
  const [org] = await db
    .insert(orgs)
    .values({
      name: options.name ?? "Test Org",
    })
    .returning();

  // Use full org ID to guarantee uniqueness (UUIDv7 first 8 chars can collide within same ms)
  const uniqueId = `${org!.id.replace(/-/g, "").slice(0, 12)}-${++orgCounter}`;
  const [user] = await db
    .insert(users)
    .values({
      email: options.email ?? `admin-${uniqueId}@example.com`,
      name: options.userName ?? "Test Admin",
      emailVerified: true,
    })
    .returning();

  await db.insert(orgMemberships).values({
    orgId: org!.id,
    userId: user!.id,
    role: "owner",
  });

  return { org: org!, user: user! };
}

/**
 * Add a user to an organization
 * Note: users is NOT RLS-protected, but org_memberships IS RLS-protected
 */
export async function createOrgMember(
  db: Database,
  orgId: string,
  options: {
    email?: string;
    name?: string;
    role?: "owner" | "admin" | "member";
  } = {},
) {
  const [user] = await db
    .insert(users)
    .values({
      email: options.email ?? `user-${Date.now()}@example.com`,
      name: options.name ?? "Test User",
      emailVerified: true,
    })
    .returning();

  await db.insert(orgMemberships).values({
    orgId,
    userId: user!.id,
    role: options.role ?? "member",
  });

  return user!;
}

/**
 * Run multiple writes under a single org context set/clear cycle.
 * Useful for reducing per-helper context overhead in integration tests.
 */
export async function insertManyWithOrgContext<T>(
  db: Database,
  orgId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await setTestOrgContext(db, orgId);
  try {
    return await fn();
  } finally {
    await clearTestOrgContext(db);
  }
}

/**
 * Create an org/user pair and prebuilt route context object.
 */
export async function createRouteTestContext(
  db: Database,
  options: { name?: string; email?: string; userName?: string } = {},
) {
  const { org, user } = await createOrg(db, options);
  const ctx = createTestContext({ orgId: org.id, userId: user.id });
  return { org, user, ctx } as const;
}

/**
 * Fast fixture for scheduling route tests with one calendar and one linked
 * appointment type. Optionally seeds weekday availability.
 */
export async function createSchedulingFixtureFast(
  db: Database,
  options: {
    orgName?: string;
    calendarName?: string;
    appointmentTypeName?: string;
    timezone?: string;
    withWeekdayAvailability?: boolean;
  } = {},
) {
  const { org, user, ctx } = await createRouteTestContext(
    db,
    options.orgName ? { name: options.orgName } : {},
  );

  const timezone = options.timezone ?? "America/New_York";
  const withWeekdayAvailability = options.withWeekdayAvailability ?? true;

  const { calendar: calendarEntity, appointmentType: appointmentTypeEntity } =
    await insertManyWithOrgContext(db, org.id, async () => {
      const [createdCalendar] = await db
        .insert(calendars)
        .values({
          orgId: org.id,
          locationId: null,
          name: options.calendarName ?? "Test Calendar",
          timezone,
        })
        .returning();

      const [createdAppointmentType] = await db
        .insert(appointmentTypes)
        .values({
          orgId: org.id,
          name: options.appointmentTypeName ?? "Consultation",
          durationMin: 60,
          paddingBeforeMin: 0,
          paddingAfterMin: 0,
          capacity: 1,
        })
        .returning();

      await db.insert(appointmentTypeCalendars).values({
        appointmentTypeId: createdAppointmentType!.id,
        calendarId: createdCalendar!.id,
      });

      if (withWeekdayAvailability) {
        const values = Array.from({ length: 7 }, (_, weekday) => ({
          calendarId: createdCalendar!.id,
          weekday,
          startTime: "09:00",
          endTime: "17:00",
          intervalMin: null,
          groupId: null,
        }));
        await db.insert(availabilityRules).values(values);
      }

      return {
        calendar: createdCalendar!,
        appointmentType: createdAppointmentType!,
      };
    });

  return {
    org,
    user,
    ctx,
    calendar: calendarEntity,
    appointmentType: appointmentTypeEntity,
  } as const;
}

/**
 * Create a location (RLS-protected)
 */
export async function createLocation(
  db: Database,
  orgId: string,
  options: { name?: string; timezone?: string } = {},
) {
  await setTestOrgContext(db, orgId);
  try {
    const [location] = await db
      .insert(locations)
      .values({
        orgId,
        name: options.name ?? "Test Location",
        timezone: options.timezone ?? "America/New_York",
      })
      .returning();
    return location!;
  } finally {
    await clearTestOrgContext(db);
  }
}

/**
 * Create a calendar (RLS-protected)
 */
export async function createCalendar(
  db: Database,
  orgId: string,
  options: { locationId?: string; name?: string; timezone?: string } = {},
) {
  await setTestOrgContext(db, orgId);
  try {
    const [calendar] = await db
      .insert(calendars)
      .values({
        orgId,
        locationId: options.locationId ?? null,
        name: options.name ?? "Test Calendar",
        timezone: options.timezone ?? "America/New_York",
      })
      .returning();
    return calendar!;
  } finally {
    await clearTestOrgContext(db);
  }
}

/**
 * Create an appointment type (RLS-protected)
 */
export async function createAppointmentType(
  db: Database,
  orgId: string,
  options: {
    name?: string;
    durationMin?: number;
    paddingBeforeMin?: number;
    paddingAfterMin?: number;
    capacity?: number;
    calendarIds?: string[];
    resourceIds?: Array<{ id: string; quantityRequired?: number }>;
  } = {},
) {
  await setTestOrgContext(db, orgId);
  try {
    const [appointmentType] = await db
      .insert(appointmentTypes)
      .values({
        orgId,
        name: options.name ?? "Test Appointment",
        durationMin: options.durationMin ?? 60,
        paddingBeforeMin: options.paddingBeforeMin ?? 0,
        paddingAfterMin: options.paddingAfterMin ?? 0,
        capacity: options.capacity ?? 1,
      })
      .returning();

    // Link calendars if specified
    if (options.calendarIds?.length) {
      await db.insert(appointmentTypeCalendars).values(
        options.calendarIds.map((calendarId) => ({
          appointmentTypeId: appointmentType!.id,
          calendarId,
        })),
      );
    }

    // Link resources if specified
    if (options.resourceIds?.length) {
      await db.insert(appointmentTypeResources).values(
        options.resourceIds.map((r) => ({
          appointmentTypeId: appointmentType!.id,
          resourceId: r.id,
          quantityRequired: r.quantityRequired ?? 1,
        })),
      );
    }

    return appointmentType!;
  } finally {
    await clearTestOrgContext(db);
  }
}

/**
 * Create a resource (RLS-protected)
 */
export async function createResource(
  db: Database,
  orgId: string,
  options: { name?: string; quantity?: number; locationId?: string } = {},
) {
  await setTestOrgContext(db, orgId);
  try {
    const [resource] = await db
      .insert(resources)
      .values({
        orgId,
        name: options.name ?? "Test Resource",
        quantity: options.quantity ?? 1,
        locationId: options.locationId ?? null,
      })
      .returning();
    return resource!;
  } finally {
    await clearTestOrgContext(db);
  }
}

/**
 * Create a client (RLS-protected)
 */
export async function createClient(
  db: Database,
  orgId: string,
  options: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    referenceId?: string;
  } = {},
) {
  await setTestOrgContext(db, orgId);
  try {
    const [client] = await db
      .insert(clients)
      .values({
        orgId,
        firstName: options.firstName ?? "Test",
        lastName: options.lastName ?? "Client",
        email: options.email ?? null,
        phone: options.phone ?? null,
        referenceId: options.referenceId ?? null,
      })
      .returning();
    return client!;
  } finally {
    await clearTestOrgContext(db);
  }
}

/**
 * Create an appointment (RLS-protected)
 */
export async function createAppointment(
  db: Database,
  orgId: string,
  options: {
    calendarId: string;
    appointmentTypeId: string;
    startAt: Date;
    endAt: Date;
    clientId: string;
    timezone?: string;
    status?: "scheduled" | "confirmed" | "cancelled" | "no_show";
    notes?: string;
  },
) {
  await setTestOrgContext(db, orgId);
  try {
    const [appointment] = await db
      .insert(appointments)
      .values({
        orgId,
        calendarId: options.calendarId,
        appointmentTypeId: options.appointmentTypeId,
        clientId: options.clientId,
        startAt: options.startAt,
        endAt: options.endAt,
        timezone: options.timezone ?? "America/New_York",
        status: options.status ?? "scheduled",
        notes: options.notes ?? null,
      })
      .returning();
    return appointment!;
  } finally {
    await clearTestOrgContext(db);
  }
}

/**
 * Create an availability rule (weekly recurring)
 * Note: availability_rules are NOT RLS-protected (calendar-scoped)
 */
export async function createAvailabilityRule(
  db: Database,
  calendarId: string,
  options: {
    weekday: number; // 0-6 (Sun-Sat)
    startTime: string; // HH:MM
    endTime: string; // HH:MM
    intervalMin?: number;
    groupId?: string;
  },
) {
  const [rule] = await db
    .insert(availabilityRules)
    .values({
      calendarId,
      weekday: options.weekday,
      startTime: options.startTime,
      endTime: options.endTime,
      intervalMin: options.intervalMin ?? null,
      groupId: options.groupId ?? null,
    })
    .returning();

  return rule!;
}

/**
 * Create an availability override (specific date)
 * Note: availability_overrides are NOT RLS-protected (calendar-scoped)
 */
export async function createAvailabilityOverride(
  db: Database,
  calendarId: string,
  options: {
    date: string; // YYYY-MM-DD
    timeRanges?: Array<{ startTime: string; endTime: string }>;
    intervalMin?: number;
    groupId?: string;
  },
) {
  const [override] = await db
    .insert(availabilityOverrides)
    .values({
      calendarId,
      date: options.date,
      timeRanges: options.timeRanges ?? [],
      intervalMin: options.intervalMin ?? null,
      groupId: options.groupId ?? null,
    })
    .returning();

  return override!;
}

/**
 * Create blocked time
 * Note: blocked_time is NOT RLS-protected (calendar-scoped)
 */
export async function createBlockedTime(
  db: Database,
  calendarId: string,
  options: {
    startAt: Date;
    endAt: Date;
    recurringRule?: string;
  },
) {
  const [blocked] = await db
    .insert(blockedTime)
    .values({
      calendarId,
      startAt: options.startAt,
      endAt: options.endAt,
      recurringRule: options.recurringRule ?? null,
    })
    .returning();

  return blocked!;
}

/**
 * Create scheduling limits
 * Note: scheduling_limits is NOT RLS-protected (calendar-scoped)
 */
export async function createSchedulingLimits(
  db: Database,
  orgId: string,
  options: {
    calendarId?: string;
    groupId?: string;
    minNoticeHours?: number;
    maxNoticeDays?: number;
    maxPerSlot?: number;
    maxPerDay?: number;
    maxPerWeek?: number;
  },
) {
  const [limits] = await db
    .insert(schedulingLimits)
    .values({
      orgId,
      calendarId: options.calendarId ?? null,
      groupId: options.groupId ?? null,
      minNoticeHours: options.minNoticeHours ?? null,
      maxNoticeDays: options.maxNoticeDays ?? null,
      maxPerSlot: options.maxPerSlot ?? null,
      maxPerDay: options.maxPerDay ?? null,
      maxPerWeek: options.maxPerWeek ?? null,
    })
    .returning();

  return limits!;
}

/**
 * Create a minimal appointment for FK references (e.g. journey runs).
 * Sets org context internally.
 */
export async function createQuickAppointment(
  db: Database,
  orgId: string,
): Promise<string> {
  await setTestOrgContext(db, orgId);
  try {
    const [loc] = await db
      .insert(locations)
      .values({ orgId, name: "FK Loc", timezone: "UTC" })
      .returning();
    const [cal] = await db
      .insert(calendars)
      .values({ orgId, locationId: loc!.id, name: "FK Cal", timezone: "UTC" })
      .returning();
    const [at] = await db
      .insert(appointmentTypes)
      .values({ orgId, name: "FK Appt Type", durationMin: 30 })
      .returning();
    const [client] = await db
      .insert(clients)
      .values({ orgId, firstName: "FK", lastName: "Client" })
      .returning();
    const [appt] = await db
      .insert(appointments)
      .values({
        orgId,
        calendarId: cal!.id,
        appointmentTypeId: at!.id,
        clientId: client!.id,
        startAt: new Date("2026-03-01T10:00:00Z"),
        endAt: new Date("2026-03-01T10:30:00Z"),
        timezone: "UTC",
        status: "scheduled",
      })
      .returning();
    return appt!.id;
  } finally {
    await clearTestOrgContext(db);
  }
}

/**
 * Create a complete test fixture with org, location, calendar, and appointment type
 * Useful for integration tests that need a full setup
 */
export async function createTestFixture(
  db: Database,
  options: {
    orgName?: string;
    locationName?: string;
    calendarName?: string;
    appointmentTypeName?: string;
    timezone?: string;
  } = {},
) {
  const { org, user } = await createOrg(
    db,
    options.orgName ? { name: options.orgName } : undefined,
  );

  // Set org context for the remaining inserts
  await setTestOrgContext(db, org.id);
  try {
    const [location] = await db
      .insert(locations)
      .values({
        orgId: org.id,
        name: options.locationName ?? "Main Office",
        timezone: options.timezone ?? "America/New_York",
      })
      .returning();

    const [calendar] = await db
      .insert(calendars)
      .values({
        orgId: org.id,
        locationId: location!.id,
        name: options.calendarName ?? "Room 1",
        timezone: options.timezone ?? "America/New_York",
      })
      .returning();

    const [appointmentType] = await db
      .insert(appointmentTypes)
      .values({
        orgId: org.id,
        name: options.appointmentTypeName ?? "Consultation",
        durationMin: 60,
      })
      .returning();

    await db.insert(appointmentTypeCalendars).values({
      appointmentTypeId: appointmentType!.id,
      calendarId: calendar!.id,
    });

    return {
      org,
      user,
      location: location!,
      calendar: calendar!,
      appointmentType: appointmentType!,
    };
  } finally {
    await clearTestOrgContext(db);
  }
}
