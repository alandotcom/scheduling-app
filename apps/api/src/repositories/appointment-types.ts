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
import { paginate } from "./base.js";
import { requireOrgId } from "../lib/request-context.js";

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
  // RLS already set by withRls() in service layer
  async findById(tx: DbClient, id: string): Promise<AppointmentType | null> {
    const [result] = await tx
      .select()
      .from(appointmentTypes)
      .where(eq(appointmentTypes.id, id))
      .limit(1);
    return result ?? null;
  }

  // RLS already set by withRls() in service layer
  async findByIdWithLinks(
    tx: DbClient,
    id: string,
  ): Promise<AppointmentTypeWithLinks | null> {
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

  // RLS already set by withRls() in service layer
  async findMany(
    tx: DbClient,
    input: PaginationInput,
  ): Promise<PaginatedResult<AppointmentType>> {
    const { cursor, limit } = input;

    const results = await tx
      .select()
      .from(appointmentTypes)
      .where(cursor ? gt(appointmentTypes.id, cursor) : undefined)
      .limit(limit + 1)
      .orderBy(appointmentTypes.id);

    return paginate(results, limit);
  }

  // RLS already set by withRls() in service layer
  async create(
    tx: DbClient,
    input: AppointmentTypeCreateInput,
  ): Promise<AppointmentType> {
    const orgId = requireOrgId();
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

  // RLS already set by withRls() in service layer
  async update(
    tx: DbClient,
    id: string,
    input: AppointmentTypeUpdateInput,
  ): Promise<AppointmentType | null> {
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

  // RLS already set by withRls() in service layer
  async delete(tx: DbClient, id: string): Promise<boolean> {
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

  // RLS already set by withRls() in service layer
  // Get calendars linked to an appointment type
  async getLinkedCalendars(
    tx: DbClient,
    appointmentTypeId: string,
  ): Promise<LinkedCalendar[]> {
    return tx
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
      .where(eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId));
  }

  // RLS already set by withRls() in service layer
  // Get resources linked to an appointment type
  async getLinkedResources(
    tx: DbClient,
    appointmentTypeId: string,
  ): Promise<LinkedResource[]> {
    return tx
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
      .where(eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId));
  }

  // RLS already set by withRls() in service layer
  // Verify a calendar exists and belongs to org
  async verifyCalendarAccess(
    tx: DbClient,
    calendarId: string,
  ): Promise<boolean> {
    const [calendar] = await tx
      .select({ id: calendars.id })
      .from(calendars)
      .where(eq(calendars.id, calendarId))
      .limit(1);
    return !!calendar;
  }

  // RLS already set by withRls() in service layer
  // Verify a resource exists and belongs to org
  async verifyResourceAccess(
    tx: DbClient,
    resourceId: string,
  ): Promise<boolean> {
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
