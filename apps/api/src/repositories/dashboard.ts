import { DateTime } from "luxon";
import { eq, sql } from "drizzle-orm";
import { appointments, calendars, clients, orgs } from "@scheduling/db/schema";
import type { DashboardSummary } from "@scheduling/dto";
import type { DbClient } from "../lib/db.js";
import { setOrgContext } from "./base.js";

const DEFAULT_TIMEZONE = "America/New_York";

export class DashboardRepository {
  async getSummary(tx: DbClient, orgId: string): Promise<DashboardSummary> {
    await setOrgContext(tx, orgId);

    const [org] = await tx
      .select({
        defaultTimezone: orgs.defaultTimezone,
      })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1);

    const timezone = org?.defaultTimezone ?? DEFAULT_TIMEZONE;
    const todayStart = DateTime.now().setZone(timezone).startOf("day");
    const todayEnd = todayStart.plus({ days: 1 });
    const dayOfWeek = todayStart.weekday % 7;
    const daysUntilWeekEnd = (7 - dayOfWeek) % 7;
    const weekEndExclusive = todayEnd.plus({ days: daysUntilWeekEnd });

    const todayStartDate = todayStart.toJSDate();
    const todayEndDate = todayEnd.toJSDate();
    const weekEndExclusiveDate = weekEndExclusive.toJSDate();

    const [appointmentCounts] = await tx
      .select({
        todayAppointments: sql<number>`(count(*) filter (where ${appointments.startAt} >= ${todayStartDate} and ${appointments.startAt} < ${todayEndDate}))::int`,
        weekAppointments: sql<number>`(count(*) filter (where ${appointments.startAt} >= ${todayStartDate} and ${appointments.startAt} < ${weekEndExclusiveDate}))::int`,
        pendingAppointments: sql<number>`(count(*) filter (where ${appointments.startAt} >= ${todayStartDate} and ${appointments.startAt} < ${weekEndExclusiveDate} and ${appointments.status} = 'scheduled'))::int`,
        noShows: sql<number>`(count(*) filter (where ${appointments.startAt} >= ${todayStartDate} and ${appointments.startAt} < ${weekEndExclusiveDate} and ${appointments.status} = 'no_show'))::int`,
      })
      .from(appointments);

    const [clientsCount] = await tx
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(clients);

    const [calendarsCount] = await tx
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(calendars);

    return {
      todayAppointments: appointmentCounts?.todayAppointments ?? 0,
      weekAppointments: appointmentCounts?.weekAppointments ?? 0,
      clients: clientsCount?.count ?? 0,
      calendars: calendarsCount?.count ?? 0,
      pendingAppointments: appointmentCounts?.pendingAppointments ?? 0,
      noShows: appointmentCounts?.noShows ?? 0,
    };
  }
}

export const dashboardRepository = new DashboardRepository();
