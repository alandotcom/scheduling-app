import { createOrg, createCalendar, createAppointmentType } from "./index.js";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";
import type * as schema from "@scheduling/db/schema";
import type { relations } from "@scheduling/db/relations";

export type AvailabilityTestDb = BunSQLDatabase<
  typeof schema,
  typeof relations
>;

export const defaultTimezone = "America/New_York";

export async function createCalendarFixture(
  db: AvailabilityTestDb,
  options?: {
    orgName?: string;
    calendarName?: string;
    timezone?: string;
  },
) {
  const { org, user } = await createOrg(db, {
    name: options?.orgName ?? "Test Org",
  });
  const calendar = await createCalendar(db, org.id, {
    name: options?.calendarName ?? "Test Calendar",
    timezone: options?.timezone ?? defaultTimezone,
  });
  return {
    org,
    user,
    calendar,
    timezone: options?.timezone ?? defaultTimezone,
  };
}

export async function createAvailabilityFixture(
  db: AvailabilityTestDb,
  options?: { timezone?: string },
) {
  const requestedTimezone = options?.timezone;
  const calendarOptions = requestedTimezone
    ? { timezone: requestedTimezone }
    : undefined;
  const {
    org,
    user,
    calendar,
    timezone: calendarTimezone,
  } = await createCalendarFixture(db, calendarOptions);
  const appointmentType = await createAppointmentType(db, org.id, {
    name: "Consultation",
    durationMin: 60,
    calendarIds: [calendar.id],
  });
  return { org, user, calendar, appointmentType, timezone: calendarTimezone };
}

export async function getAvailabilityRoutes() {
  return (await import("../routes/availability.js")).availabilityRoutes;
}
