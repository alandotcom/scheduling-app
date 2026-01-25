// Appointment type repository - data access layer for appointment types

import { eq, gt, and } from "drizzle-orm";
import {
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
      .innerJoin(calendars, eq(appointmentTypeCalendars.calendarId, calendars.id))
      .where(eq(appointmentTypeCalendars.appointmentTypeId, id));

    // Get linked resources
    const linkedResources = await tx
      .select({
        id: resources.id,
        name: resources.name,
        quantityRequired: appointmentTypeResources.quantityRequired,
      })
      .from(appointmentTypeResources)
      .innerJoin(resources, eq(appointmentTypeResources.resourceId, resources.id))
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
  ): Promise<PaginatedResult<AppointmentType>> {
    await setOrgContext(tx, orgId);
    const { cursor, limit } = input;

    const results = await tx
      .select()
      .from(appointmentTypes)
      .where(cursor ? gt(appointmentTypes.id, cursor) : undefined)
      .limit(limit + 1)
      .orderBy(appointmentTypes.id);

    return paginate(results, limit);
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

  // Link appointment type to a calendar
  async linkCalendar(
    tx: DbClient,
    appointmentTypeId: string,
    calendarId: string,
  ): Promise<void> {
    await tx
      .insert(appointmentTypeCalendars)
      .values({ appointmentTypeId, calendarId })
      .onConflictDoNothing();
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

  // Link appointment type to a resource with quantity
  async linkResource(
    tx: DbClient,
    appointmentTypeId: string,
    resourceId: string,
    quantityRequired: number = 1,
  ): Promise<void> {
    await tx
      .insert(appointmentTypeResources)
      .values({ appointmentTypeId, resourceId, quantityRequired })
      .onConflictDoNothing();
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

  // Get calendars linked to an appointment type
  async getLinkedCalendars(
    tx: DbClient,
    orgId: string,
    appointmentTypeId: string,
  ): Promise<LinkedCalendar[]> {
    await setOrgContext(tx, orgId);
    return tx
      .select({
        id: calendars.id,
        name: calendars.name,
        timezone: calendars.timezone,
      })
      .from(appointmentTypeCalendars)
      .innerJoin(calendars, eq(appointmentTypeCalendars.calendarId, calendars.id))
      .where(eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId));
  }

  // Get resources linked to an appointment type
  async getLinkedResources(
    tx: DbClient,
    orgId: string,
    appointmentTypeId: string,
  ): Promise<LinkedResource[]> {
    await setOrgContext(tx, orgId);
    return tx
      .select({
        id: resources.id,
        name: resources.name,
        quantityRequired: appointmentTypeResources.quantityRequired,
      })
      .from(appointmentTypeResources)
      .innerJoin(resources, eq(appointmentTypeResources.resourceId, resources.id))
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
