// Seed script for development/demo database
// Creates two demo orgs with rich scheduling data
// IDEMPOTENT: deterministic reset + reseed for managed demo orgs

import { drizzle } from "drizzle-orm/bun-sql";
import { eq, inArray, sql } from "drizzle-orm";
import { SQL } from "bun";
import { faker } from "@faker-js/faker";
import {
  appointmentTypeCalendars,
  appointmentTypeResources,
  appointmentTypes,
  appointments,
  availabilityOverrides,
  availabilityRules,
  blockedTime,
  calendars,
  clients,
  locations,
  orgMemberships,
  orgs,
  resources,
  schedulingLimits,
  users,
} from "@scheduling/db/schema";
import { auth } from "../lib/auth.js";

const databaseUrl =
  process.env["DATABASE_URL"] ??
  "postgres://scheduling:scheduling@localhost:5433/scheduling";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

type AppointmentStatus = "scheduled" | "confirmed" | "cancelled" | "no_show";
type CalendarProfile = "provider" | "support";

type SeedLocation = {
  key: string;
  name: string;
  timezone: string;
};

type SeedCalendar = {
  key: string;
  name: string;
  locationKey: string;
  timezone: string;
  profile: CalendarProfile;
};

type SeedAppointmentType = {
  key: string;
  name: string;
  durationMin: number;
  paddingBeforeMin?: number;
  paddingAfterMin?: number;
  capacity?: number;
  calendarKeys: string[];
};

type SeedOrg = {
  name: string;
  locations: SeedLocation[];
  calendars: SeedCalendar[];
  appointmentTypes: SeedAppointmentType[];
};

type AppointmentSpec = {
  dayOffset: number;
  hour: number;
  minute: number;
  calendarKey: string;
  appointmentTypeKey: string;
  clientIndex: number;
  status: AppointmentStatus;
};

type SeedSummary = {
  locations: number;
  calendars: number;
  appointmentTypes: number;
  clients: number;
  appointments: number;
  availabilityRules: number;
  availabilityOverrides: number;
  blockedTime: number;
};

type SeedClient = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
};

const CLIENT_FIXTURE_COUNT = 12;
const DEV_ADMIN_EMAIL = "admin@example.com";
const DEV_ADMIN_PASSWORD = "password123";

const APPOINTMENT_TYPE_FIXTURES: SeedAppointmentType[] = [
  {
    key: "initial_consult",
    name: "Initial Consultation",
    durationMin: 60,
    paddingAfterMin: 15,
    calendarKeys: ["provider_a", "provider_b"],
  },
  {
    key: "follow_up",
    name: "Follow-up Visit",
    durationMin: 30,
    paddingAfterMin: 10,
    calendarKeys: ["provider_a", "provider_b", "support"],
  },
  {
    key: "annual_exam",
    name: "Annual Wellness Exam",
    durationMin: 45,
    paddingAfterMin: 10,
    calendarKeys: ["provider_a", "provider_b"],
  },
  {
    key: "procedure",
    name: "Procedure Visit",
    durationMin: 90,
    paddingAfterMin: 15,
    calendarKeys: ["provider_b"],
  },
  {
    key: "quick_check",
    name: "Quick Check-in",
    durationMin: 15,
    paddingAfterMin: 5,
    calendarKeys: ["provider_a", "support"],
  },
];

const APPOINTMENT_SPECS: AppointmentSpec[] = [
  {
    dayOffset: -18,
    hour: 9,
    minute: 0,
    calendarKey: "provider_a",
    appointmentTypeKey: "initial_consult",
    clientIndex: 0,
    status: "confirmed",
  },
  {
    dayOffset: -16,
    hour: 10,
    minute: 30,
    calendarKey: "provider_b",
    appointmentTypeKey: "follow_up",
    clientIndex: 1,
    status: "confirmed",
  },
  {
    dayOffset: -15,
    hour: 14,
    minute: 0,
    calendarKey: "provider_b",
    appointmentTypeKey: "annual_exam",
    clientIndex: 2,
    status: "cancelled",
  },
  {
    dayOffset: -13,
    hour: 11,
    minute: 0,
    calendarKey: "support",
    appointmentTypeKey: "quick_check",
    clientIndex: 3,
    status: "no_show",
  },
  {
    dayOffset: -11,
    hour: 13,
    minute: 30,
    calendarKey: "provider_a",
    appointmentTypeKey: "follow_up",
    clientIndex: 4,
    status: "confirmed",
  },
  {
    dayOffset: -9,
    hour: 15,
    minute: 0,
    calendarKey: "provider_b",
    appointmentTypeKey: "procedure",
    clientIndex: 5,
    status: "confirmed",
  },
  {
    dayOffset: -7,
    hour: 9,
    minute: 15,
    calendarKey: "provider_a",
    appointmentTypeKey: "quick_check",
    clientIndex: 6,
    status: "scheduled",
  },
  {
    dayOffset: -4,
    hour: 10,
    minute: 0,
    calendarKey: "provider_b",
    appointmentTypeKey: "follow_up",
    clientIndex: 7,
    status: "cancelled",
  },
  {
    dayOffset: -2,
    hour: 16,
    minute: 0,
    calendarKey: "support",
    appointmentTypeKey: "follow_up",
    clientIndex: 8,
    status: "confirmed",
  },
  {
    dayOffset: 1,
    hour: 9,
    minute: 0,
    calendarKey: "provider_a",
    appointmentTypeKey: "initial_consult",
    clientIndex: 9,
    status: "scheduled",
  },
  {
    dayOffset: 2,
    hour: 11,
    minute: 0,
    calendarKey: "provider_b",
    appointmentTypeKey: "procedure",
    clientIndex: 10,
    status: "confirmed",
  },
  {
    dayOffset: 3,
    hour: 13,
    minute: 0,
    calendarKey: "support",
    appointmentTypeKey: "quick_check",
    clientIndex: 11,
    status: "scheduled",
  },
  {
    dayOffset: 4,
    hour: 10,
    minute: 30,
    calendarKey: "provider_a",
    appointmentTypeKey: "follow_up",
    clientIndex: 0,
    status: "scheduled",
  },
  {
    dayOffset: 5,
    hour: 14,
    minute: 0,
    calendarKey: "provider_b",
    appointmentTypeKey: "annual_exam",
    clientIndex: 1,
    status: "confirmed",
  },
  {
    dayOffset: 6,
    hour: 9,
    minute: 45,
    calendarKey: "provider_a",
    appointmentTypeKey: "quick_check",
    clientIndex: 2,
    status: "scheduled",
  },
  {
    dayOffset: 8,
    hour: 15,
    minute: 0,
    calendarKey: "support",
    appointmentTypeKey: "follow_up",
    clientIndex: 3,
    status: "scheduled",
  },
  {
    dayOffset: 10,
    hour: 11,
    minute: 30,
    calendarKey: "provider_b",
    appointmentTypeKey: "initial_consult",
    clientIndex: 4,
    status: "confirmed",
  },
  {
    dayOffset: 12,
    hour: 13,
    minute: 30,
    calendarKey: "provider_a",
    appointmentTypeKey: "annual_exam",
    clientIndex: 5,
    status: "scheduled",
  },
  {
    dayOffset: 14,
    hour: 10,
    minute: 0,
    calendarKey: "provider_b",
    appointmentTypeKey: "follow_up",
    clientIndex: 6,
    status: "scheduled",
  },
  {
    dayOffset: 17,
    hour: 15,
    minute: 30,
    calendarKey: "support",
    appointmentTypeKey: "quick_check",
    clientIndex: 7,
    status: "scheduled",
  },
];

const SEED_ORGS: SeedOrg[] = [
  {
    name: "Acme Scheduling",
    locations: [
      {
        key: "primary",
        name: "Main Office",
        timezone: "America/New_York",
      },
      {
        key: "secondary",
        name: "Telehealth Suite",
        timezone: "America/New_York",
      },
    ],
    calendars: [
      {
        key: "provider_a",
        name: "Dr. Smith",
        locationKey: "primary",
        timezone: "America/New_York",
        profile: "provider",
      },
      {
        key: "provider_b",
        name: "Dr. Patel",
        locationKey: "primary",
        timezone: "America/New_York",
        profile: "provider",
      },
      {
        key: "support",
        name: "Nurse Ava",
        locationKey: "secondary",
        timezone: "America/New_York",
        profile: "support",
      },
    ],
    appointmentTypes: APPOINTMENT_TYPE_FIXTURES,
  },
  {
    name: "Northwind Therapy Group",
    locations: [
      {
        key: "primary",
        name: "River North Clinic",
        timezone: "America/Chicago",
      },
      {
        key: "secondary",
        name: "Virtual Care Hub",
        timezone: "America/Chicago",
      },
    ],
    calendars: [
      {
        key: "provider_a",
        name: "Dr. Rivera",
        locationKey: "primary",
        timezone: "America/Chicago",
        profile: "provider",
      },
      {
        key: "provider_b",
        name: "Dr. Chen",
        locationKey: "primary",
        timezone: "America/Chicago",
        profile: "provider",
      },
      {
        key: "support",
        name: "Coach Maya",
        locationKey: "secondary",
        timezone: "America/Chicago",
        profile: "support",
      },
    ],
    appointmentTypes: APPOINTMENT_TYPE_FIXTURES,
  },
];

function createSeedFromText(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function slugifyOrgName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeEmailLocalPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function buildClientFixtures(
  orgName: string,
  usedFullNames: Set<string>,
  usedEmails: Set<string>,
): SeedClient[] {
  const orgSlug = slugifyOrgName(orgName);
  const seed = createSeedFromText(`clients:${orgName}`);
  const phoneBase = 1000 + (seed % 7000);
  const fixtures: SeedClient[] = [];

  faker.seed(seed);

  for (let index = 0; index < CLIENT_FIXTURE_COUNT; index += 1) {
    let createdFixture: SeedClient | null = null;

    for (let attempts = 0; attempts < 50; attempts += 1) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const fullNameKey = `${firstName} ${lastName}`.toLowerCase();

      if (usedFullNames.has(fullNameKey)) {
        continue;
      }

      const emailLocalPart = normalizeEmailLocalPart(
        `${firstName}.${lastName}.${orgSlug}.${index + 1}`,
      );
      const email = `${emailLocalPart}@example.com`;

      if (usedEmails.has(email)) {
        continue;
      }

      usedFullNames.add(fullNameKey);
      usedEmails.add(email);

      createdFixture = {
        firstName,
        lastName,
        email,
        phone:
          index % 4 === 0
            ? null
            : `+1415555${String(phoneBase + index)
                .padStart(4, "0")
                .slice(-4)}`,
      };
      break;
    }

    if (!createdFixture) {
      throw new Error(
        `Failed to generate unique client fixture for org: ${orgName}`,
      );
    }

    fixtures.push(createdFixture);
  }

  return fixtures;
}

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function dateAtDayOffset(
  startOfDayUtc: Date,
  dayOffset: number,
  hour: number,
  minute: number,
): Date {
  return new Date(
    startOfDayUtc.getTime() +
      dayOffset * DAY_MS +
      hour * 60 * MINUTE_MS +
      minute * MINUTE_MS,
  );
}

function dateStringAtDayOffset(startOfDayUtc: Date, dayOffset: number): string {
  return dateAtDayOffset(startOfDayUtc, dayOffset, 0, 0)
    .toISOString()
    .slice(0, 10);
}

async function seed() {
  const isLocal =
    databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1");
  if (!isLocal && process.env["NODE_ENV"] === "production") {
    console.error(
      "ERROR: seed() refused to run — DATABASE_URL does not point to localhost and NODE_ENV is 'production'.",
    );
    process.exit(1);
  }

  console.log("Seeding database...");

  const client = new SQL(databaseUrl);
  const db = drizzle({ client });
  const startOfDayUtc = startOfUtcDay();
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  async function withUserContext<T>(
    userId: string,
    fn: (tx: Tx) => Promise<T>,
  ) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_user_id', ${userId}, true)`,
      );
      return fn(tx);
    });
  }

  async function withOrgContext<T>(orgId: string, fn: (tx: Tx) => Promise<T>) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.current_org_id', ${orgId}, true)`,
      );
      return fn(tx);
    });
  }

  async function getOrCreateAdminUser() {
    const existingUser = await db
      .select({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(eq(users.email, DEV_ADMIN_EMAIL))
      .limit(1);

    if (existingUser.length > 0) {
      const [adminUser] = existingUser;
      if (!adminUser) {
        throw new Error("Expected existing admin user to be defined");
      }

      if (!adminUser.emailVerified) {
        await db
          .update(users)
          .set({ emailVerified: true })
          .where(eq(users.id, adminUser.id));
        console.log(`Admin user already exists: ${adminUser.email} (verified)`);
      } else {
        console.log(`Admin user already exists: ${adminUser.email}`);
      }

      return { id: adminUser.id, email: adminUser.email };
    }

    console.log("Creating admin user via BetterAuth...");
    const result = await auth.api.signUpEmail({
      body: {
        name: "Admin User",
        email: DEV_ADMIN_EMAIL,
        password: DEV_ADMIN_PASSWORD,
      },
    });

    if (!result.user) {
      throw new Error("Failed to create admin user via BetterAuth");
    }

    await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, result.user.id));

    console.log(`Created admin user: ${result.user.email} (${result.user.id})`);
    return { id: result.user.id, email: result.user.email };
  }

  async function getOrCreateOrg(orgName: string) {
    const existingOrg = await db
      .select({ id: orgs.id, name: orgs.name })
      .from(orgs)
      .where(eq(orgs.name, orgName))
      .limit(1);

    if (existingOrg.length > 0) {
      console.log(`Org already exists: ${existingOrg[0]!.name}`);
      return existingOrg[0]!;
    }

    const [newOrg] = await db
      .insert(orgs)
      .values({ name: orgName })
      .returning({ id: orgs.id, name: orgs.name });

    if (!newOrg) {
      throw new Error(`Failed to create org: ${orgName}`);
    }

    console.log(`Created org: ${newOrg.name} (${newOrg.id})`);
    return newOrg;
  }

  async function ensureAdminMembership(orgId: string, userId: string) {
    const membershipResult = await withUserContext(userId, async (tx) =>
      tx
        .insert(orgMemberships)
        .values({
          orgId,
          userId,
          role: "owner",
        })
        .onConflictDoNothing()
        .returning({ id: orgMemberships.id }),
    );

    if (membershipResult.length > 0) {
      console.log("Created org membership for admin");
    } else {
      console.log("Org membership already exists");
    }
  }

  async function resetOrgDomainData(orgId: string) {
    await withOrgContext(orgId, async (tx) => {
      const existingCalendars = await tx
        .select({ id: calendars.id })
        .from(calendars)
        .where(eq(calendars.orgId, orgId));
      const calendarIds = existingCalendars.map((row) => row.id);

      const existingAppointmentTypes = await tx
        .select({ id: appointmentTypes.id })
        .from(appointmentTypes)
        .where(eq(appointmentTypes.orgId, orgId));
      const appointmentTypeIds = existingAppointmentTypes.map((row) => row.id);

      await tx.delete(appointments).where(eq(appointments.orgId, orgId));
      await tx.delete(clients).where(eq(clients.orgId, orgId));

      if (calendarIds.length > 0) {
        await tx
          .delete(availabilityRules)
          .where(inArray(availabilityRules.calendarId, calendarIds));
        await tx
          .delete(availabilityOverrides)
          .where(inArray(availabilityOverrides.calendarId, calendarIds));
        await tx
          .delete(blockedTime)
          .where(inArray(blockedTime.calendarId, calendarIds));
        await tx
          .delete(schedulingLimits)
          .where(inArray(schedulingLimits.calendarId, calendarIds));
        await tx
          .delete(appointmentTypeCalendars)
          .where(inArray(appointmentTypeCalendars.calendarId, calendarIds));
      }

      if (appointmentTypeIds.length > 0) {
        await tx
          .delete(appointmentTypeResources)
          .where(
            inArray(
              appointmentTypeResources.appointmentTypeId,
              appointmentTypeIds,
            ),
          );
      }

      await tx.delete(resources).where(eq(resources.orgId, orgId));
      await tx
        .delete(appointmentTypes)
        .where(eq(appointmentTypes.orgId, orgId));
      await tx.delete(calendars).where(eq(calendars.orgId, orgId));
      await tx.delete(locations).where(eq(locations.orgId, orgId));
    });
  }

  async function seedOrgData(
    orgId: string,
    seedOrg: SeedOrg,
    usedClientNames: Set<string>,
    usedClientEmails: Set<string>,
  ): Promise<SeedSummary> {
    await resetOrgDomainData(orgId);

    return withOrgContext(orgId, async (tx) => {
      const locationIds = new Map<string, string>();
      const calendarIds = new Map<string, string>();
      const calendarProfiles = new Map<string, CalendarProfile>();
      const appointmentTypeByKey = new Map<
        string,
        { id: string; durationMin: number }
      >();
      const clientIds: string[] = [];
      const clientFixtures = buildClientFixtures(
        seedOrg.name,
        usedClientNames,
        usedClientEmails,
      );

      for (const location of seedOrg.locations) {
        const [inserted] = await tx
          .insert(locations)
          .values({
            orgId,
            name: location.name,
            timezone: location.timezone,
          })
          .returning({ id: locations.id });

        if (!inserted) {
          throw new Error(`Failed to create location: ${location.name}`);
        }

        locationIds.set(location.key, inserted.id);
      }

      for (const calendar of seedOrg.calendars) {
        const locationId = locationIds.get(calendar.locationKey);
        if (!locationId) {
          throw new Error(`Missing location key for calendar: ${calendar.key}`);
        }

        const [inserted] = await tx
          .insert(calendars)
          .values({
            orgId,
            locationId,
            name: calendar.name,
            timezone: calendar.timezone,
          })
          .returning({ id: calendars.id });

        if (!inserted) {
          throw new Error(`Failed to create calendar: ${calendar.name}`);
        }

        calendarIds.set(calendar.key, inserted.id);
        calendarProfiles.set(calendar.key, calendar.profile);
      }

      for (const appointmentType of seedOrg.appointmentTypes) {
        const [insertedType] = await tx
          .insert(appointmentTypes)
          .values({
            orgId,
            name: appointmentType.name,
            durationMin: appointmentType.durationMin,
            paddingBeforeMin: appointmentType.paddingBeforeMin ?? 0,
            paddingAfterMin: appointmentType.paddingAfterMin ?? 0,
            capacity: appointmentType.capacity ?? 1,
          })
          .returning({ id: appointmentTypes.id });

        if (!insertedType) {
          throw new Error(
            `Failed to create appointment type: ${appointmentType.name}`,
          );
        }

        const linkedCalendarIds = appointmentType.calendarKeys.map(
          (calendarKey) => {
            const calendarId = calendarIds.get(calendarKey);
            if (!calendarId) {
              throw new Error(
                `Missing calendar key for appointment type link: ${calendarKey}`,
              );
            }
            return calendarId;
          },
        );

        await tx.insert(appointmentTypeCalendars).values(
          linkedCalendarIds.map((calendarId) => ({
            appointmentTypeId: insertedType.id,
            calendarId,
          })),
        );

        appointmentTypeByKey.set(appointmentType.key, {
          id: insertedType.id,
          durationMin: appointmentType.durationMin,
        });
      }

      for (const clientFixture of clientFixtures) {
        const [insertedClient] = await tx
          .insert(clients)
          .values({
            orgId,
            firstName: clientFixture.firstName,
            lastName: clientFixture.lastName,
            email: clientFixture.email,
            phone: clientFixture.phone,
          })
          .returning({ id: clients.id });

        if (!insertedClient) {
          throw new Error(
            `Failed to create client: ${clientFixture.firstName} ${clientFixture.lastName}`,
          );
        }

        clientIds.push(insertedClient.id);
      }

      const availabilityRuleRows: Array<{
        calendarId: string;
        weekday: number;
        startTime: string;
        endTime: string;
        intervalMin: number;
      }> = [];

      for (const [calendarKey, calendarId] of calendarIds.entries()) {
        const profile = calendarProfiles.get(calendarKey);
        if (!profile) continue;

        if (profile === "provider") {
          for (const weekday of [1, 2, 3, 4, 5]) {
            availabilityRuleRows.push({
              calendarId,
              weekday,
              startTime: "09:00",
              endTime: "12:00",
              intervalMin: 15,
            });
            availabilityRuleRows.push({
              calendarId,
              weekday,
              startTime: "13:00",
              endTime: "17:00",
              intervalMin: 15,
            });
          }
        } else {
          for (const weekday of [1, 2, 3, 4, 5]) {
            availabilityRuleRows.push({
              calendarId,
              weekday,
              startTime: "08:00",
              endTime: "12:00",
              intervalMin: 15,
            });
            availabilityRuleRows.push({
              calendarId,
              weekday,
              startTime: "12:30",
              endTime: "16:00",
              intervalMin: 15,
            });
          }
          availabilityRuleRows.push({
            calendarId,
            weekday: 6,
            startTime: "09:00",
            endTime: "12:00",
            intervalMin: 30,
          });
        }
      }

      if (availabilityRuleRows.length > 0) {
        await tx.insert(availabilityRules).values(availabilityRuleRows);
      }

      const providerACalendarId = calendarIds.get("provider_a");
      const providerBCalendarId = calendarIds.get("provider_b");
      const supportCalendarId = calendarIds.get("support");

      if (!providerACalendarId || !providerBCalendarId || !supportCalendarId) {
        throw new Error(
          "Required calendars missing for overrides/blocked time",
        );
      }

      await tx.insert(availabilityOverrides).values([
        {
          calendarId: providerACalendarId,
          date: dateStringAtDayOffset(startOfDayUtc, 7),
          timeRanges: [],
          intervalMin: null,
          groupId: null,
        },
        {
          calendarId: providerBCalendarId,
          date: dateStringAtDayOffset(startOfDayUtc, 9),
          timeRanges: [{ startTime: "10:00", endTime: "14:00" }],
          intervalMin: 20,
          groupId: null,
        },
        {
          calendarId: supportCalendarId,
          date: dateStringAtDayOffset(startOfDayUtc, 8),
          timeRanges: [{ startTime: "09:00", endTime: "11:30" }],
          intervalMin: 15,
          groupId: null,
        },
      ]);

      await tx.insert(blockedTime).values([
        {
          calendarId: providerACalendarId,
          startAt: dateAtDayOffset(startOfDayUtc, 4, 12, 0),
          endAt: dateAtDayOffset(startOfDayUtc, 4, 13, 0),
          recurringRule: null,
        },
        {
          calendarId: providerBCalendarId,
          startAt: dateAtDayOffset(startOfDayUtc, 6, 15, 0),
          endAt: dateAtDayOffset(startOfDayUtc, 6, 16, 0),
          recurringRule: "FREQ=WEEKLY;BYDAY=TU",
        },
        {
          calendarId: supportCalendarId,
          startAt: dateAtDayOffset(startOfDayUtc, 5, 10, 0),
          endAt: dateAtDayOffset(startOfDayUtc, 5, 10, 45),
          recurringRule: null,
        },
      ]);

      for (const spec of APPOINTMENT_SPECS) {
        const calendarId = calendarIds.get(spec.calendarKey);
        const appointmentType = appointmentTypeByKey.get(
          spec.appointmentTypeKey,
        );
        const clientId = clientIds[spec.clientIndex];

        if (!calendarId) {
          throw new Error(
            `Missing calendar for appointment spec: ${spec.calendarKey}`,
          );
        }
        if (!appointmentType) {
          throw new Error(
            `Missing appointment type for appointment spec: ${spec.appointmentTypeKey}`,
          );
        }
        if (!clientId) {
          throw new Error(
            `Missing client for appointment spec index: ${spec.clientIndex}`,
          );
        }

        const startAt = dateAtDayOffset(
          startOfDayUtc,
          spec.dayOffset,
          spec.hour,
          spec.minute,
        );
        const endAt = new Date(
          startAt.getTime() + appointmentType.durationMin * MINUTE_MS,
        );

        const calendarTimezone = seedOrg.calendars.find(
          (calendar) => calendar.key === spec.calendarKey,
        )?.timezone;

        if (!calendarTimezone) {
          throw new Error(
            `Missing calendar timezone for appointment spec: ${spec.calendarKey}`,
          );
        }

        await tx.insert(appointments).values({
          orgId,
          calendarId,
          appointmentTypeId: appointmentType.id,
          clientId,
          startAt,
          endAt,
          timezone: calendarTimezone,
          status: spec.status,
          notes:
            spec.status === "cancelled"
              ? "Cancelled by client"
              : spec.status === "no_show"
                ? "Client did not arrive"
                : null,
        });
      }

      return {
        locations: seedOrg.locations.length,
        calendars: seedOrg.calendars.length,
        appointmentTypes: seedOrg.appointmentTypes.length,
        clients: clientFixtures.length,
        appointments: APPOINTMENT_SPECS.length,
        availabilityRules: availabilityRuleRows.length,
        availabilityOverrides: 3,
        blockedTime: 3,
      };
    });
  }

  try {
    const adminUser = await getOrCreateAdminUser();
    const orgSummaries: Array<{ name: string; summary: SeedSummary }> = [];
    const usedClientNames = new Set<string>();
    const usedClientEmails = new Set<string>();

    for (const seedOrg of SEED_ORGS) {
      console.log(`\nPreparing org: ${seedOrg.name}`);
      const org = await getOrCreateOrg(seedOrg.name);
      await ensureAdminMembership(org.id, adminUser.id);

      console.log(`Resetting + seeding rich data for org: ${seedOrg.name}`);
      const summary = await seedOrgData(
        org.id,
        seedOrg,
        usedClientNames,
        usedClientEmails,
      );
      orgSummaries.push({ name: seedOrg.name, summary });
    }

    console.log("\nSeed completed successfully!");
    for (const orgSummary of orgSummaries) {
      const { summary } = orgSummary;
      console.log(`\n${orgSummary.name}:`);
      console.log(`  Locations: ${summary.locations}`);
      console.log(`  Calendars: ${summary.calendars}`);
      console.log(`  Appointment types: ${summary.appointmentTypes}`);
      console.log(`  Clients: ${summary.clients}`);
      console.log(`  Appointments: ${summary.appointments}`);
      console.log(`  Availability rules: ${summary.availabilityRules}`);
      console.log(`  Availability overrides: ${summary.availabilityOverrides}`);
      console.log(`  Blocked time entries: ${summary.blockedTime}`);
    }

    console.log("\nDemo credentials:");
    console.log(`  Email: ${DEV_ADMIN_EMAIL}`);
    console.log(`  Password: ${DEV_ADMIN_PASSWORD}`);
  } finally {
    client.close();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
