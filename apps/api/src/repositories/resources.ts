// Resource repository - data access layer for resources

import { eq, gt, and } from "drizzle-orm";
import { resources } from "@scheduling/db/schema";
import type { PaginationInput, PaginatedResult } from "./base.js";
import type { DbClient } from "../lib/db.js";
import { paginate } from "./base.js";
import { requireOrgId } from "../lib/request-context.js";

// Types inferred from schema
export type Resource = typeof resources.$inferSelect;
export type ResourceInsert = typeof resources.$inferInsert;

export interface ResourceCreateInput {
  name: string;
  locationId?: string | null | undefined;
  quantity?: number | undefined;
}

export interface ResourceUpdateInput {
  name?: string | undefined;
  locationId?: string | null | undefined;
  quantity?: number | undefined;
}

export interface ResourceListInput extends PaginationInput {
  locationId?: string | null | undefined;
}

export class ResourceRepository {
  async findById(tx: DbClient, id: string): Promise<Resource | null> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .select()
      .from(resources)
      .where(eq(resources.id, id))
      .limit(1);
    return result ?? null;
  }

  async findMany(
    tx: DbClient,
    input: ResourceListInput,
  ): Promise<PaginatedResult<Resource>> {
    // RLS already set by withRls() in service layer
    const { cursor, limit, locationId } = input;

    let conditions = cursor ? gt(resources.id, cursor) : undefined;

    if (locationId) {
      conditions = conditions
        ? and(conditions, eq(resources.locationId, locationId))
        : eq(resources.locationId, locationId);
    }

    const results = await tx
      .select()
      .from(resources)
      .where(conditions)
      .limit(limit + 1)
      .orderBy(resources.id);

    return paginate(results, limit);
  }

  async create(tx: DbClient, input: ResourceCreateInput): Promise<Resource> {
    // RLS already set by withRls() in service layer
    const orgId = requireOrgId(); // Need explicit orgId for INSERT
    const [result] = await tx
      .insert(resources)
      .values({
        orgId,
        name: input.name,
        locationId: input.locationId ?? null,
        quantity: input.quantity ?? 1,
      })
      .returning();
    return result!;
  }

  async update(
    tx: DbClient,
    id: string,
    input: ResourceUpdateInput,
  ): Promise<Resource | null> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .update(resources)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(resources.id, id))
      .returning();
    return result ?? null;
  }

  async delete(tx: DbClient, id: string): Promise<boolean> {
    // RLS already set by withRls() in service layer
    const result = await tx
      .delete(resources)
      .where(eq(resources.id, id))
      .returning({ id: resources.id });
    return result.length > 0;
  }
}

// Singleton instance
export const resourceRepository = new ResourceRepository();
