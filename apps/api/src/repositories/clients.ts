// Client repository - data access layer for clients

import { eq, gt, or, ilike } from "drizzle-orm";
import { clients } from "@scheduling/db/schema";
import type { PaginationInput, PaginatedResult } from "./base.js";
import type { DbClient } from "../lib/db.js";
import { paginate, setOrgContext } from "./base.js";

// Types inferred from schema
export type Client = typeof clients.$inferSelect;
export type ClientInsert = typeof clients.$inferInsert;

export interface ClientCreateInput {
  firstName: string;
  lastName: string;
  email?: string | null | undefined;
  phone?: string | null | undefined;
}

export interface ClientUpdateInput {
  firstName?: string | undefined;
  lastName?: string | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
}

export interface ClientListInput extends PaginationInput {
  search?: string | null | undefined;
}

export class ClientRepository {
  async findById(tx: DbClient, orgId: string, id: string): Promise<Client | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx.select().from(clients).where(eq(clients.id, id)).limit(1);
    return result ?? null;
  }

  async findMany(
    tx: DbClient,
    orgId: string,
    input: ClientListInput,
  ): Promise<PaginatedResult<Client>> {
    await setOrgContext(tx, orgId);
    const { cursor, limit, search } = input;

    let query = tx.select().from(clients).$dynamic();

    // Apply cursor pagination
    if (cursor) {
      query = query.where(gt(clients.id, cursor));
    }

    // Apply search filter if provided
    if (search) {
      const searchPattern = `%${search}%`;
      query = query.where(
        or(
          ilike(clients.firstName, searchPattern),
          ilike(clients.lastName, searchPattern),
          ilike(clients.email, searchPattern),
        ),
      );
    }

    const results = await query.limit(limit + 1).orderBy(clients.id);
    return paginate(results, limit);
  }

  async create(tx: DbClient, orgId: string, input: ClientCreateInput): Promise<Client> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .insert(clients)
      .values({
        orgId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
      })
      .returning();
    return result!;
  }

  async update(
    tx: DbClient,
    orgId: string,
    id: string,
    input: ClientUpdateInput,
  ): Promise<Client | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .update(clients)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, id))
      .returning();
    return result ?? null;
  }

  async delete(tx: DbClient, orgId: string, id: string): Promise<boolean> {
    await setOrgContext(tx, orgId);
    const result = await tx.delete(clients).where(eq(clients.id, id)).returning({ id: clients.id });
    return result.length > 0;
  }
}

// Singleton instance
export const clientRepository = new ClientRepository();
