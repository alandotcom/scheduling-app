// Location repository - data access layer for locations

import { eq, gt, inArray, sql } from "drizzle-orm";
import { calendars, locations, resources } from "@scheduling/db/schema";
import type { PaginationInput, PaginatedResult } from "./base.js";
import type { OrgScopedTx } from "../lib/db.js";
import { paginate } from "./base.js";

// Types inferred from schema
export type Location = typeof locations.$inferSelect;
export type LocationInsert = typeof locations.$inferInsert;
export type LocationWithRelationshipCounts = Location & {
  relationshipCounts: {
    calendars: number;
    resources: number;
  };
};

export interface LocationCreateInput {
  name: string;
  timezone: string;
}

export interface LocationUpdateInput {
  name?: string | undefined;
  timezone?: string | undefined;
}

export class LocationRepository {
  async findById(tx: OrgScopedTx, id: string): Promise<Location | null> {
    const [result] = await tx
      .select()
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1);
    return result ?? null;
  }

  async findMany(
    tx: OrgScopedTx,
    input: PaginationInput,
  ): Promise<PaginatedResult<LocationWithRelationshipCounts>> {
    const { cursor, limit } = input;

    const results = await tx
      .select()
      .from(locations)
      .where(cursor ? gt(locations.id, cursor) : undefined)
      .limit(limit + 1)
      .orderBy(locations.id);

    const paginated = paginate(results, limit);

    if (paginated.items.length === 0) {
      return {
        ...paginated,
        items: [],
      };
    }

    const locationIds = paginated.items.map((location) => location.id);
    const [calendarCounts, resourceCounts] = await Promise.all([
      tx
        .select({
          locationId: calendars.locationId,
          calendars: sql<number>`count(*)::int`,
        })
        .from(calendars)
        .where(inArray(calendars.locationId, locationIds))
        .groupBy(calendars.locationId),
      tx
        .select({
          locationId: resources.locationId,
          resources: sql<number>`count(*)::int`,
        })
        .from(resources)
        .where(inArray(resources.locationId, locationIds))
        .groupBy(resources.locationId),
    ]);

    const calendarCountByLocationId = new Map<string, number>();
    for (const row of calendarCounts) {
      if (row.locationId) {
        calendarCountByLocationId.set(row.locationId, row.calendars);
      }
    }

    const resourceCountByLocationId = new Map<string, number>();
    for (const row of resourceCounts) {
      if (row.locationId) {
        resourceCountByLocationId.set(row.locationId, row.resources);
      }
    }

    return {
      ...paginated,
      items: paginated.items.map((location) => ({
        ...location,
        relationshipCounts: {
          calendars: calendarCountByLocationId.get(location.id) ?? 0,
          resources: resourceCountByLocationId.get(location.id) ?? 0,
        },
      })),
    };
  }

  async create(tx: OrgScopedTx, input: LocationCreateInput): Promise<Location> {
    const [result] = await tx
      .insert(locations)
      .values({
        name: input.name,
        timezone: input.timezone,
      })
      .returning();
    return result!;
  }

  async update(
    tx: OrgScopedTx,
    id: string,
    input: LocationUpdateInput,
  ): Promise<Location | null> {
    const [result] = await tx
      .update(locations)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(locations.id, id))
      .returning();
    return result ?? null;
  }

  async delete(tx: OrgScopedTx, id: string): Promise<boolean> {
    const result = await tx
      .delete(locations)
      .where(eq(locations.id, id))
      .returning({ id: locations.id });
    return result.length > 0;
  }
}

// Singleton instance
export const locationRepository = new LocationRepository();
