// Location repository - data access layer for locations

import { eq, gt } from "drizzle-orm";
import { locations } from "@scheduling/db/schema";
import type { PaginationInput, PaginatedResult } from "./base.js";
import type { DbClient } from "../lib/db.js";
import { paginate, setOrgContext } from "./base.js";

// Types inferred from schema
export type Location = typeof locations.$inferSelect;
export type LocationInsert = typeof locations.$inferInsert;

export interface LocationCreateInput {
  name: string;
  timezone: string;
}

export interface LocationUpdateInput {
  name?: string | undefined;
  timezone?: string | undefined;
}

export class LocationRepository {
  async findById(
    tx: DbClient,
    orgId: string,
    id: string,
  ): Promise<Location | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .select()
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1);
    return result ?? null;
  }

  async findMany(
    tx: DbClient,
    orgId: string,
    input: PaginationInput,
  ): Promise<PaginatedResult<Location>> {
    await setOrgContext(tx, orgId);
    const { cursor, limit } = input;

    const results = await tx
      .select()
      .from(locations)
      .where(cursor ? gt(locations.id, cursor) : undefined)
      .limit(limit + 1)
      .orderBy(locations.id);

    return paginate(results, limit);
  }

  async create(
    tx: DbClient,
    orgId: string,
    input: LocationCreateInput,
  ): Promise<Location> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .insert(locations)
      .values({
        orgId,
        name: input.name,
        timezone: input.timezone,
      })
      .returning();
    return result!;
  }

  async update(
    tx: DbClient,
    orgId: string,
    id: string,
    input: LocationUpdateInput,
  ): Promise<Location | null> {
    await setOrgContext(tx, orgId);
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

  async delete(tx: DbClient, orgId: string, id: string): Promise<boolean> {
    await setOrgContext(tx, orgId);
    const result = await tx
      .delete(locations)
      .where(eq(locations.id, id))
      .returning({ id: locations.id });
    return result.length > 0;
  }
}

// Singleton instance
export const locationRepository = new LocationRepository();
