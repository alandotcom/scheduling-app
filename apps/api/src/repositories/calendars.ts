// Calendar repository - data access layer for calendars

import { and, eq, gt, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { appointments, calendars, locations } from "@scheduling/db/schema";
import type { PaginationInput, PaginatedResult } from "./base.js";
import type { DbClient } from "../lib/db.js";
import { paginate, setOrgContext } from "./base.js";

// Types inferred from schema
export type Calendar = typeof calendars.$inferSelect;
export type CalendarInsert = typeof calendars.$inferInsert;
export type CalendarWithRelationshipCounts = Calendar & {
  relationshipCounts: {
    appointmentsThisWeek: number;
  };
};

export interface CalendarCreateInput {
  name: string;
  timezone: string;
  slotIntervalMin?: number | undefined;
  locationId?: string | null | undefined;
  requiresConfirmation?: boolean | undefined;
}

export interface CalendarUpdateInput {
  name?: string | undefined;
  timezone?: string | undefined;
  slotIntervalMin?: number | undefined;
  locationId?: string | null | undefined;
  requiresConfirmation?: boolean | undefined;
}

export interface CalendarListInput extends PaginationInput {
  locationId?: string | null | undefined;
}

export interface CalendarWithLocation {
  calendar: Calendar;
  location: {
    id: string;
    name: string;
    timezone: string;
  } | null;
}

export class CalendarRepository {
  async findById(
    tx: DbClient,
    orgId: string,
    id: string,
  ): Promise<Calendar | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .select()
      .from(calendars)
      .where(eq(calendars.id, id))
      .limit(1);
    return result ?? null;
  }

  async findByIdWithLocation(
    tx: DbClient,
    orgId: string,
    id: string,
  ): Promise<CalendarWithLocation | null> {
    await setOrgContext(tx, orgId);
    const results = await tx
      .select({
        calendar: calendars,
        location: {
          id: locations.id,
          name: locations.name,
          timezone: locations.timezone,
        },
      })
      .from(calendars)
      .leftJoin(locations, eq(calendars.locationId, locations.id))
      .where(eq(calendars.id, id))
      .limit(1);
    return results[0] ?? null;
  }

  async findMany(
    tx: DbClient,
    orgId: string,
    input: CalendarListInput,
  ): Promise<PaginatedResult<CalendarWithRelationshipCounts>> {
    await setOrgContext(tx, orgId);
    const { cursor, limit, locationId } = input;

    let query = tx.select().from(calendars).$dynamic();

    if (cursor) {
      query = query.where(gt(calendars.id, cursor));
    }

    if (locationId) {
      query = query.where(eq(calendars.locationId, locationId));
    }

    const results = await query.limit(limit + 1).orderBy(calendars.id);
    const paginated = paginate(results, limit);

    if (paginated.items.length === 0) {
      return {
        ...paginated,
        items: [],
      };
    }

    const calendarIdsByTimezone = new Map<string, string[]>();
    for (const calendar of paginated.items) {
      const ids = calendarIdsByTimezone.get(calendar.timezone);
      if (ids) {
        ids.push(calendar.id);
      } else {
        calendarIdsByTimezone.set(calendar.timezone, [calendar.id]);
      }
    }

    const appointmentCountGroups = await Promise.all(
      Array.from(calendarIdsByTimezone.entries()).map(([timezone, ids]) => {
        const startOfWeek = DateTime.now().setZone(timezone).startOf("week");
        const endOfWeek = startOfWeek.plus({ weeks: 1 });
        const startOfWeekUtc = startOfWeek.toUTC().toJSDate();
        const endOfWeekUtc = endOfWeek.toUTC().toJSDate();

        return tx
          .select({
            calendarId: appointments.calendarId,
            appointmentsThisWeek: sql<number>`count(*)::int`,
          })
          .from(appointments)
          .where(
            and(
              inArray(appointments.calendarId, ids),
              ne(appointments.status, "cancelled"),
              gte(appointments.startAt, startOfWeekUtc),
              lt(appointments.startAt, endOfWeekUtc),
            ),
          )
          .groupBy(appointments.calendarId);
      }),
    );

    const countByCalendarId = new Map<string, number>();
    for (const group of appointmentCountGroups) {
      for (const row of group) {
        countByCalendarId.set(row.calendarId, row.appointmentsThisWeek);
      }
    }

    return {
      ...paginated,
      items: paginated.items.map((calendar) => ({
        ...calendar,
        relationshipCounts: {
          appointmentsThisWeek: countByCalendarId.get(calendar.id) ?? 0,
        },
      })),
    };
  }

  async create(
    tx: DbClient,
    orgId: string,
    input: CalendarCreateInput,
  ): Promise<Calendar> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .insert(calendars)
      .values({
        orgId,
        name: input.name,
        timezone: input.timezone,
        slotIntervalMin: input.slotIntervalMin ?? 15,
        locationId: input.locationId ?? null,
        requiresConfirmation: input.requiresConfirmation ?? false,
      })
      .returning();
    return result!;
  }

  async update(
    tx: DbClient,
    orgId: string,
    id: string,
    input: CalendarUpdateInput,
  ): Promise<Calendar | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .update(calendars)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(calendars.id, id))
      .returning();
    return result ?? null;
  }

  async delete(tx: DbClient, orgId: string, id: string): Promise<boolean> {
    await setOrgContext(tx, orgId);
    const result = await tx
      .delete(calendars)
      .where(eq(calendars.id, id))
      .returning({ id: calendars.id });
    return result.length > 0;
  }

  async verifyLocationAccess(
    tx: DbClient,
    orgId: string,
    locationId: string,
  ): Promise<boolean> {
    await setOrgContext(tx, orgId);
    const [location] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, locationId))
      .limit(1);
    return !!location;
  }
}

// Singleton instance
export const calendarRepository = new CalendarRepository();
