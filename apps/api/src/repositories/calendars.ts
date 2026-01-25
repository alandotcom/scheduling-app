// Calendar repository - data access layer for calendars

import { eq, gt } from "drizzle-orm";
import { calendars, locations } from "@scheduling/db/schema";
import type { PaginationInput, PaginatedResult } from "./base.js";
import type { DbClient } from "../lib/db.js";
import { paginate } from "./base.js";
import { requireOrgId } from "../lib/request-context.js";

// Types inferred from schema
export type Calendar = typeof calendars.$inferSelect;
export type CalendarInsert = typeof calendars.$inferInsert;

export interface CalendarCreateInput {
  name: string;
  timezone: string;
  locationId?: string | null | undefined;
}

export interface CalendarUpdateInput {
  name?: string | undefined;
  timezone?: string | undefined;
  locationId?: string | null | undefined;
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
  async findById(tx: DbClient, id: string): Promise<Calendar | null> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .select()
      .from(calendars)
      .where(eq(calendars.id, id))
      .limit(1);
    return result ?? null;
  }

  async findByIdWithLocation(
    tx: DbClient,
    id: string,
  ): Promise<CalendarWithLocation | null> {
    // RLS already set by withRls() in service layer
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
    input: CalendarListInput,
  ): Promise<PaginatedResult<Calendar>> {
    // RLS already set by withRls() in service layer
    const { cursor, limit, locationId } = input;

    let query = tx.select().from(calendars).$dynamic();

    if (cursor) {
      query = query.where(gt(calendars.id, cursor));
    }

    if (locationId) {
      query = query.where(eq(calendars.locationId, locationId));
    }

    const results = await query.limit(limit + 1).orderBy(calendars.id);
    return paginate(results, limit);
  }

  async create(tx: DbClient, input: CalendarCreateInput): Promise<Calendar> {
    // RLS already set by withRls() in service layer
    const orgId = requireOrgId(); // Need explicit orgId for INSERT
    const [result] = await tx
      .insert(calendars)
      .values({
        orgId,
        name: input.name,
        timezone: input.timezone,
        locationId: input.locationId ?? null,
      })
      .returning();
    return result!;
  }

  async update(
    tx: DbClient,
    id: string,
    input: CalendarUpdateInput,
  ): Promise<Calendar | null> {
    // RLS already set by withRls() in service layer
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

  async delete(tx: DbClient, id: string): Promise<boolean> {
    // RLS already set by withRls() in service layer
    const result = await tx
      .delete(calendars)
      .where(eq(calendars.id, id))
      .returning({ id: calendars.id });
    return result.length > 0;
  }

  async verifyLocationAccess(
    tx: DbClient,
    locationId: string,
  ): Promise<boolean> {
    // RLS already set by withRls() in service layer
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
