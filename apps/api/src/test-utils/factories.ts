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
  setTestUserContext,
  clearTestUserContext,
} from "@scheduling/db/test-utils";

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

  // Set user context for RLS before inserting org_membership
  await setTestUserContext(db, user!.id);
  try {
    await db.insert(orgMemberships).values({
      orgId: org!.id,
      userId: user!.id,
      role: "admin",
    });
  } finally {
    await clearTestUserContext(db);
  }

  return { org: org!, user: user! };
}

/**
 * Add a user to an organization
 * Note: users is NOT RLS-protected, but org_memberships IS RLS-protected
 */
export async function createOrgMember(
  db: Database,
  orgId: string,
  options: { email?: string; name?: string; role?: "admin" | "staff" } = {},
) {
  const [user] = await db
    .insert(users)
    .values({
      email: options.email ?? `user-${Date.now()}@example.com`,
      name: options.name ?? "Test User",
      emailVerified: true,
    })
    .returning();

  // Set user context for RLS before inserting org_membership
  await setTestUserContext(db, user!.id);
  try {
    await db.insert(orgMemberships).values({
      orgId,
      userId: user!.id,
      role: options.role ?? "staff",
    });
  } finally {
    await clearTestUserContext(db);
  }

  return user!;
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
    clientId?: string;
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
        clientId: options.clientId ?? null,
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
