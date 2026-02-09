// Appointment type repository - data access layer for appointment types

import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import {
  appointments,
  appointmentTypes,
  appointmentTypeCalendars,
  appointmentTypeResources,
  calendars,
  resources,
} from "@scheduling/db/schema";
import type { PaginationInput, PaginatedResult } from "./base.js";
import type { DbClient } from "../lib/db.js";
import { paginate, setOrgContext } from "./base.js";

// Types inferred from schema
export type AppointmentType = typeof appointmentTypes.$inferSelect;
export type AppointmentTypeInsert = typeof appointmentTypes.$inferInsert;
export type AppointmentTypeWithRelationshipCounts = AppointmentType & {
  relationshipCounts: {
    calendars: number;
    resources: number;
    appointments: number;
  };
};

export interface AppointmentTypeCreateInput {
  name: string;
  durationMin: number;
  paddingBeforeMin?: number | null | undefined;
  paddingAfterMin?: number | null | undefined;
  capacity?: number | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
}

export interface AppointmentTypeUpdateInput {
  name?: string | undefined;
  durationMin?: number | undefined;
  paddingBeforeMin?: number | null | undefined;
  paddingAfterMin?: number | null | undefined;
  capacity?: number | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
}

export interface LinkedCalendar {
  id: string;
  name: string;
  timezone: string;
}

export interface LinkedResource {
  id: string;
  name: string;
  quantityRequired: number;
}

// Full calendar association with nested calendar object (for API responses)
export interface CalendarAssociation {
  id: string;
  appointmentTypeId: string;
  calendarId: string;
  calendar: {
    id: string;
    orgId: string;
    name: string;
    timezone: string;
    locationId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

// Full resource association with nested resource object (for API responses)
export interface ResourceAssociation {
  id: string;
  appointmentTypeId: string;
  resourceId: string;
  quantityRequired: number;
  resource: {
    id: string;
    orgId: string;
    name: string;
    quantity: number;
    locationId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

// Association record returned from create operations
export interface CalendarAssociationRecord {
  id: string;
  appointmentTypeId: string;
  calendarId: string;
}

export interface ResourceAssociationRecord {
  id: string;
  appointmentTypeId: string;
  resourceId: string;
  quantityRequired: number;
}

export interface AppointmentTypeWithLinks {
  appointmentType: AppointmentType;
  calendars: LinkedCalendar[];
  resources: LinkedResource[];
}

export class AppointmentTypeRepository {
  async findById(
    tx: DbClient,
    orgId: string,
    id: string,
  ): Promise<AppointmentType | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .select()
      .from(appointmentTypes)
      .where(eq(appointmentTypes.id, id))
      .limit(1);
    return result ?? null;
  }

  async findByIdWithLinks(
    tx: DbClient,
    orgId: string,
    id: string,
  ): Promise<AppointmentTypeWithLinks | null> {
    await setOrgContext(tx, orgId);

    // Get the appointment type
    const [appointmentType] = await tx
      .select()
      .from(appointmentTypes)
      .where(eq(appointmentTypes.id, id))
      .limit(1);

    if (!appointmentType) {
      return null;
    }

    // Get linked calendars
    const linkedCalendars = await tx
      .select({
        id: calendars.id,
        name: calendars.name,
        timezone: calendars.timezone,
      })
      .from(appointmentTypeCalendars)
      .innerJoin(
        calendars,
        eq(appointmentTypeCalendars.calendarId, calendars.id),
      )
      .where(eq(appointmentTypeCalendars.appointmentTypeId, id));

    // Get linked resources
    const linkedResources = await tx
      .select({
        id: resources.id,
        name: resources.name,
        quantityRequired: appointmentTypeResources.quantityRequired,
      })
      .from(appointmentTypeResources)
      .innerJoin(
        resources,
        eq(appointmentTypeResources.resourceId, resources.id),
      )
      .where(eq(appointmentTypeResources.appointmentTypeId, id));

    return {
      appointmentType,
      calendars: linkedCalendars,
      resources: linkedResources,
    };
  }

  async findMany(
    tx: DbClient,
    orgId: string,
    input: PaginationInput,
  ): Promise<PaginatedResult<AppointmentTypeWithRelationshipCounts>> {
    await setOrgContext(tx, orgId);
    const { cursor, limit } = input;

    const results = await tx
      .select()
      .from(appointmentTypes)
      .where(cursor ? gt(appointmentTypes.id, cursor) : undefined)
      .limit(limit + 1)
      .orderBy(appointmentTypes.id);

    const paginated = paginate(results, limit);

    if (paginated.items.length === 0) {
      return {
        ...paginated,
        items: [],
      };
    }

    const appointmentTypeIds = paginated.items.map(
      (appointmentType) => appointmentType.id,
    );

    const [calendarCounts, resourceCounts, appointmentCounts] =
      await Promise.all([
        tx
          .select({
            appointmentTypeId: appointmentTypeCalendars.appointmentTypeId,
            calendars: sql<number>`count(*)::int`,
          })
          .from(appointmentTypeCalendars)
          .where(
            inArray(
              appointmentTypeCalendars.appointmentTypeId,
              appointmentTypeIds,
            ),
          )
          .groupBy(appointmentTypeCalendars.appointmentTypeId),
        tx
          .select({
            appointmentTypeId: appointmentTypeResources.appointmentTypeId,
            resources: sql<number>`count(*)::int`,
          })
          .from(appointmentTypeResources)
          .where(
            inArray(
              appointmentTypeResources.appointmentTypeId,
              appointmentTypeIds,
            ),
          )
          .groupBy(appointmentTypeResources.appointmentTypeId),
        tx
          .select({
            appointmentTypeId: appointments.appointmentTypeId,
            appointments: sql<number>`count(*)::int`,
          })
          .from(appointments)
          .where(
            and(
              inArray(appointments.appointmentTypeId, appointmentTypeIds),
              ne(appointments.status, "cancelled"),
            ),
          )
          .groupBy(appointments.appointmentTypeId),
      ]);

    const calendarCountById = new Map<string, number>();
    for (const row of calendarCounts) {
      calendarCountById.set(row.appointmentTypeId, row.calendars);
    }

    const resourceCountById = new Map<string, number>();
    for (const row of resourceCounts) {
      resourceCountById.set(row.appointmentTypeId, row.resources);
    }

    const appointmentCountById = new Map<string, number>();
    for (const row of appointmentCounts) {
      appointmentCountById.set(row.appointmentTypeId, row.appointments);
    }

    return {
      ...paginated,
      items: paginated.items.map((appointmentType) => ({
        ...appointmentType,
        relationshipCounts: {
          calendars: calendarCountById.get(appointmentType.id) ?? 0,
          resources: resourceCountById.get(appointmentType.id) ?? 0,
          appointments: appointmentCountById.get(appointmentType.id) ?? 0,
        },
      })),
    };
  }

  async create(
    tx: DbClient,
    orgId: string,
    input: AppointmentTypeCreateInput,
  ): Promise<AppointmentType> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .insert(appointmentTypes)
      .values({
        orgId,
        name: input.name,
        durationMin: input.durationMin,
        paddingBeforeMin: input.paddingBeforeMin ?? 0,
        paddingAfterMin: input.paddingAfterMin ?? 0,
        capacity: input.capacity ?? 1,
        metadata: input.metadata ?? null,
      })
      .returning();
    return result!;
  }

  async update(
    tx: DbClient,
    orgId: string,
    id: string,
    input: AppointmentTypeUpdateInput,
  ): Promise<AppointmentType | null> {
    await setOrgContext(tx, orgId);
    const [result] = await tx
      .update(appointmentTypes)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(appointmentTypes.id, id))
      .returning();
    return result ?? null;
  }

  async delete(tx: DbClient, orgId: string, id: string): Promise<boolean> {
    await setOrgContext(tx, orgId);
    const result = await tx
      .delete(appointmentTypes)
      .where(eq(appointmentTypes.id, id))
      .returning({ id: appointmentTypes.id });
    return result.length > 0;
  }

  // Check if calendar is already linked
  async findCalendarLink(
    tx: DbClient,
    appointmentTypeId: string,
    calendarId: string,
  ): Promise<CalendarAssociationRecord | null> {
    const [result] = await tx
      .select({
        id: appointmentTypeCalendars.id,
        appointmentTypeId: appointmentTypeCalendars.appointmentTypeId,
        calendarId: appointmentTypeCalendars.calendarId,
      })
      .from(appointmentTypeCalendars)
      .where(
        and(
          eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId),
          eq(appointmentTypeCalendars.calendarId, calendarId),
        ),
      )
      .limit(1);
    return result ?? null;
  }

  // Link appointment type to a calendar (returns association record)
  async linkCalendar(
    tx: DbClient,
    appointmentTypeId: string,
    calendarId: string,
  ): Promise<CalendarAssociationRecord> {
    const [result] = await tx
      .insert(appointmentTypeCalendars)
      .values({ appointmentTypeId, calendarId })
      .returning({
        id: appointmentTypeCalendars.id,
        appointmentTypeId: appointmentTypeCalendars.appointmentTypeId,
        calendarId: appointmentTypeCalendars.calendarId,
      });
    return result!;
  }

  // Unlink appointment type from a calendar
  async unlinkCalendar(
    tx: DbClient,
    appointmentTypeId: string,
    calendarId: string,
  ): Promise<boolean> {
    const result = await tx
      .delete(appointmentTypeCalendars)
      .where(
        and(
          eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId),
          eq(appointmentTypeCalendars.calendarId, calendarId),
        ),
      )
      .returning({ id: appointmentTypeCalendars.id });
    return result.length > 0;
  }

  // Check if resource is already linked
  async findResourceLink(
    tx: DbClient,
    appointmentTypeId: string,
    resourceId: string,
  ): Promise<ResourceAssociationRecord | null> {
    const [result] = await tx
      .select({
        id: appointmentTypeResources.id,
        appointmentTypeId: appointmentTypeResources.appointmentTypeId,
        resourceId: appointmentTypeResources.resourceId,
        quantityRequired: appointmentTypeResources.quantityRequired,
      })
      .from(appointmentTypeResources)
      .where(
        and(
          eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId),
          eq(appointmentTypeResources.resourceId, resourceId),
        ),
      )
      .limit(1);
    return result ?? null;
  }

  // Link appointment type to a resource with quantity (returns association record)
  async linkResource(
    tx: DbClient,
    appointmentTypeId: string,
    resourceId: string,
    quantityRequired: number = 1,
  ): Promise<ResourceAssociationRecord> {
    const [result] = await tx
      .insert(appointmentTypeResources)
      .values({ appointmentTypeId, resourceId, quantityRequired })
      .returning({
        id: appointmentTypeResources.id,
        appointmentTypeId: appointmentTypeResources.appointmentTypeId,
        resourceId: appointmentTypeResources.resourceId,
        quantityRequired: appointmentTypeResources.quantityRequired,
      });
    return result!;
  }

  // Unlink appointment type from a resource
  async unlinkResource(
    tx: DbClient,
    appointmentTypeId: string,
    resourceId: string,
  ): Promise<boolean> {
    const result = await tx
      .delete(appointmentTypeResources)
      .where(
        and(
          eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId),
          eq(appointmentTypeResources.resourceId, resourceId),
        ),
      )
      .returning({ id: appointmentTypeResources.id });
    return result.length > 0;
  }

  // Update resource link quantity
  async updateResourceLink(
    tx: DbClient,
    appointmentTypeId: string,
    resourceId: string,
    quantityRequired: number,
  ): Promise<boolean> {
    const result = await tx
      .update(appointmentTypeResources)
      .set({ quantityRequired })
      .where(
        and(
          eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId),
          eq(appointmentTypeResources.resourceId, resourceId),
        ),
      )
      .returning({ id: appointmentTypeResources.id });
    return result.length > 0;
  }

  // Get calendars linked to an appointment type (with full calendar objects)
  async getLinkedCalendars(
    tx: DbClient,
    orgId: string,
    appointmentTypeId: string,
  ): Promise<CalendarAssociation[]> {
    await setOrgContext(tx, orgId);
    return tx
      .select({
        id: appointmentTypeCalendars.id,
        appointmentTypeId: appointmentTypeCalendars.appointmentTypeId,
        calendarId: appointmentTypeCalendars.calendarId,
        calendar: calendars,
      })
      .from(appointmentTypeCalendars)
      .innerJoin(
        calendars,
        eq(appointmentTypeCalendars.calendarId, calendars.id),
      )
      .where(eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId));
  }

  // Get resources linked to an appointment type (with full resource objects)
  async getLinkedResources(
    tx: DbClient,
    orgId: string,
    appointmentTypeId: string,
  ): Promise<ResourceAssociation[]> {
    await setOrgContext(tx, orgId);
    return tx
      .select({
        id: appointmentTypeResources.id,
        appointmentTypeId: appointmentTypeResources.appointmentTypeId,
        resourceId: appointmentTypeResources.resourceId,
        quantityRequired: appointmentTypeResources.quantityRequired,
        resource: resources,
      })
      .from(appointmentTypeResources)
      .innerJoin(
        resources,
        eq(appointmentTypeResources.resourceId, resources.id),
      )
      .where(eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId));
  }

  // Verify a calendar exists and belongs to org
  async verifyCalendarAccess(
    tx: DbClient,
    orgId: string,
    calendarId: string,
  ): Promise<boolean> {
    await setOrgContext(tx, orgId);
    const [calendar] = await tx
      .select({ id: calendars.id })
      .from(calendars)
      .where(eq(calendars.id, calendarId))
      .limit(1);
    return !!calendar;
  }

  // Verify a resource exists and belongs to org
  async verifyResourceAccess(
    tx: DbClient,
    orgId: string,
    resourceId: string,
  ): Promise<boolean> {
    await setOrgContext(tx, orgId);
    const [resource] = await tx
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1);
    return !!resource;
  }
}

// Singleton instance
export const appointmentTypeRepository = new AppointmentTypeRepository();
