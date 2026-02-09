// Client repository - data access layer for clients

import {
  and,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  lt,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { clients, appointments } from "@scheduling/db/schema";
import type { PaginationInput, PaginatedResult } from "./base.js";
import type { DbClient } from "../lib/db.js";
import { paginate, setOrgContext } from "./base.js";

// Types inferred from schema
export type Client = typeof clients.$inferSelect;
export type ClientInsert = typeof clients.$inferInsert;
export type ClientWithRelationshipCounts = Client & {
  relationshipCounts: {
    appointments: number;
  };
};

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
  sort?: "id_asc" | "updated_at_desc" | undefined;
}

export class ClientRepository {
  async findById(
    tx: DbClient,
    orgId: string,
    id: string,
  ): Promise<Client | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .select()
      .from(clients)
      .where(eq(clients.id, id))
      .limit(1);
    return result ?? null;
  }

  async findMany(
    tx: DbClient,
    orgId: string,
    input: ClientListInput,
  ): Promise<PaginatedResult<ClientWithRelationshipCounts>> {
    await setOrgContext(tx, orgId);
    const { cursor, limit, search, sort = "id_asc" } = input;

    let query = tx.select().from(clients).$dynamic();
    const filters: SQL[] = [];

    // Apply cursor pagination
    if (cursor) {
      if (sort === "updated_at_desc") {
        const [cursorClient] = await tx
          .select({ id: clients.id, updatedAt: clients.updatedAt })
          .from(clients)
          .where(eq(clients.id, cursor))
          .limit(1);

        if (!cursorClient) {
          return {
            items: [],
            nextCursor: null,
            hasMore: false,
          };
        }

        const cursorFilter = or(
          lt(clients.updatedAt, cursorClient.updatedAt),
          and(
            eq(clients.updatedAt, cursorClient.updatedAt),
            lt(clients.id, cursorClient.id),
          ),
        );
        if (cursorFilter) {
          filters.push(cursorFilter);
        }
      } else {
        filters.push(gt(clients.id, cursor));
      }
    }

    // Apply search filter if provided
    if (search) {
      const searchPattern = `%${search}%`;
      const searchFilter = or(
        ilike(clients.firstName, searchPattern),
        ilike(clients.lastName, searchPattern),
        ilike(clients.email, searchPattern),
      );
      if (searchFilter) {
        filters.push(searchFilter);
      }
    }

    if (filters.length === 1) {
      const [singleFilter] = filters;
      if (singleFilter) {
        query = query.where(singleFilter);
      }
    } else if (filters.length > 1) {
      const combinedFilters = and(...filters);
      if (combinedFilters) {
        query = query.where(combinedFilters);
      }
    }

    const orderByColumns =
      sort === "updated_at_desc"
        ? [desc(clients.updatedAt), desc(clients.id)]
        : [clients.id];

    const results = await query.limit(limit + 1).orderBy(...orderByColumns);
    const paginated = paginate(results, limit);

    if (paginated.items.length === 0) {
      return {
        ...paginated,
        items: [],
      };
    }

    const clientIds = paginated.items.map((client) => client.id);
    const appointmentCounts = await tx
      .select({
        clientId: appointments.clientId,
        appointments: sql<number>`count(*)::int`,
      })
      .from(appointments)
      .where(
        and(
          inArray(appointments.clientId, clientIds),
          ne(appointments.status, "cancelled"),
        ),
      )
      .groupBy(appointments.clientId);

    const countByClientId = new Map<string, number>();
    for (const row of appointmentCounts) {
      if (row.clientId) {
        countByClientId.set(row.clientId, row.appointments);
      }
    }

    return {
      ...paginated,
      items: paginated.items.map((client) => ({
        ...client,
        relationshipCounts: {
          appointments: countByClientId.get(client.id) ?? 0,
        },
      })),
    };
  }

  async create(
    tx: DbClient,
    orgId: string,
    input: ClientCreateInput,
  ): Promise<Client> {
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
    const result = await tx
      .delete(clients)
      .where(eq(clients.id, id))
      .returning({ id: clients.id });
    return result.length > 0;
  }

  async getHistorySummary(
    tx: DbClient,
    orgId: string,
    clientId: string,
  ): Promise<{
    totalAppointments: number;
    upcomingAppointments: number;
    pastAppointments: number;
    cancelledAppointments: number;
    noShowAppointments: number;
    lastAppointmentAt: Date | null;
    nextAppointmentAt: Date | null;
  }> {
    await setOrgContext(tx, orgId);
    const now = new Date();

    const [summary] = await tx
      .select({
        totalAppointments: sql<number>`count(*)::int`,
        upcomingAppointments: sql<number>`(count(*) filter (where ${appointments.startAt} > ${now} and ${appointments.status} <> 'cancelled'))::int`,
        pastAppointments: sql<number>`(count(*) filter (where ${appointments.startAt} <= ${now}))::int`,
        cancelledAppointments: sql<number>`(count(*) filter (where ${appointments.status} = 'cancelled'))::int`,
        noShowAppointments: sql<number>`(count(*) filter (where ${appointments.status} = 'no_show'))::int`,
        lastAppointmentAt: sql<Date | null>`max(${appointments.startAt}) filter (where ${appointments.startAt} <= ${now} and ${appointments.status} <> 'cancelled')`,
        nextAppointmentAt: sql<Date | null>`min(${appointments.startAt}) filter (where ${appointments.startAt} > ${now} and ${appointments.status} <> 'cancelled')`,
      })
      .from(appointments)
      .where(eq(appointments.clientId, clientId));

    return (
      summary ?? {
        totalAppointments: 0,
        upcomingAppointments: 0,
        pastAppointments: 0,
        cancelledAppointments: 0,
        noShowAppointments: 0,
        lastAppointmentAt: null,
        nextAppointmentAt: null,
      }
    );
  }
}

// Singleton instance
export const clientRepository = new ClientRepository();
