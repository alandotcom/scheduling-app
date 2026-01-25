// Appointment repository - data access layer for appointments

import { eq, gt, gte, lte, ne, and, or } from "drizzle-orm";
import {
  appointments,
  calendars,
  appointmentTypes,
  clients,
  appointmentTypeCalendars,
} from "@scheduling/db/schema";
import type { PaginationInput, PaginatedResult } from "./base.js";
import type { DbClient } from "../lib/db.js";
import { requireOrgId } from "../lib/request-context.js";

// Types inferred from schema
export type Appointment = typeof appointments.$inferSelect;
export type AppointmentInsert = typeof appointments.$inferInsert;

export interface AppointmentCreateInput {
  calendarId: string;
  appointmentTypeId: string;
  clientId?: string | null | undefined;
  startAt: Date;
  endAt: Date;
  timezone: string;
  status: string;
  notes?: string | null | undefined;
}

export interface AppointmentUpdateInput {
  clientId?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface AppointmentRescheduleInput {
  startAt: Date;
  endAt: Date;
  timezone: string;
}

export interface AppointmentListInput extends PaginationInput {
  calendarId?: string | null | undefined;
  appointmentTypeId?: string | null | undefined;
  clientId?: string | null | undefined;
  status?: string | null | undefined;
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
}

// Joined appointment type for list/get results
export interface AppointmentWithRelations {
  appointment: Appointment;
  calendar: {
    id: string;
    name: string;
    timezone: string;
  } | null;
  appointmentType: {
    id: string;
    name: string;
    durationMin: number;
  } | null;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  } | null;
}

export interface AppointmentTypeData {
  id: string;
  name: string;
  durationMin: number;
  paddingBeforeMin: number | null;
  paddingAfterMin: number | null;
  capacity: number | null;
}

export class AppointmentRepository {
  async findById(tx: DbClient, id: string): Promise<Appointment | null> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .select()
      .from(appointments)
      .where(eq(appointments.id, id))
      .limit(1);
    return result ?? null;
  }

  async findByIdWithRelations(
    tx: DbClient,
    id: string,
  ): Promise<AppointmentWithRelations | null> {
    // RLS already set by withRls() in service layer
    const results = await tx
      .select({
        appointment: appointments,
        calendar: {
          id: calendars.id,
          name: calendars.name,
          timezone: calendars.timezone,
        },
        appointmentType: {
          id: appointmentTypes.id,
          name: appointmentTypes.name,
          durationMin: appointmentTypes.durationMin,
        },
        client: {
          id: clients.id,
          firstName: clients.firstName,
          lastName: clients.lastName,
          email: clients.email,
        },
      })
      .from(appointments)
      .leftJoin(calendars, eq(appointments.calendarId, calendars.id))
      .leftJoin(
        appointmentTypes,
        eq(appointments.appointmentTypeId, appointmentTypes.id),
      )
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .where(eq(appointments.id, id))
      .limit(1);
    return results[0] ?? null;
  }

  async findMany(
    tx: DbClient,
    input: AppointmentListInput,
  ): Promise<PaginatedResult<AppointmentWithRelations>> {
    // RLS already set by withRls() in service layer
    const {
      cursor,
      limit,
      calendarId,
      appointmentTypeId,
      clientId,
      status,
      startDate,
      endDate,
    } = input;

    // Build conditions array
    const conditions: ReturnType<typeof eq>[] = [];

    if (cursor) {
      conditions.push(gt(appointments.id, cursor));
    }

    if (calendarId) {
      conditions.push(eq(appointments.calendarId, calendarId));
    }

    if (appointmentTypeId) {
      conditions.push(eq(appointments.appointmentTypeId, appointmentTypeId));
    }

    if (clientId) {
      conditions.push(eq(appointments.clientId, clientId));
    }

    if (status) {
      conditions.push(eq(appointments.status, status));
    }

    if (startDate) {
      const [year, month, day] = startDate.split("-").map(Number);
      const startDateTime = new Date(
        Date.UTC(year!, month! - 1, day!, 0, 0, 0),
      );
      conditions.push(gte(appointments.startAt, startDateTime));
    }

    if (endDate) {
      const [year, month, day] = endDate.split("-").map(Number);
      const endDateTime = new Date(
        Date.UTC(year!, month! - 1, day!, 23, 59, 59, 999),
      );
      conditions.push(lte(appointments.startAt, endDateTime));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await tx
      .select({
        appointment: appointments,
        calendar: {
          id: calendars.id,
          name: calendars.name,
          timezone: calendars.timezone,
        },
        appointmentType: {
          id: appointmentTypes.id,
          name: appointmentTypes.name,
          durationMin: appointmentTypes.durationMin,
        },
        client: {
          id: clients.id,
          firstName: clients.firstName,
          lastName: clients.lastName,
          email: clients.email,
        },
      })
      .from(appointments)
      .leftJoin(calendars, eq(appointments.calendarId, calendars.id))
      .leftJoin(
        appointmentTypes,
        eq(appointments.appointmentTypeId, appointmentTypes.id),
      )
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .where(whereClause)
      .limit(limit + 1)
      .orderBy(appointments.id);

    // Custom pagination for joined results
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;
    return {
      items,
      nextCursor: hasMore
        ? (items[items.length - 1]?.appointment.id ?? null)
        : null,
      hasMore,
    };
  }

  async create(
    tx: DbClient,
    input: AppointmentCreateInput,
  ): Promise<Appointment> {
    // RLS already set by withRls() in service layer
    const orgId = requireOrgId();
    const [result] = await tx
      .insert(appointments)
      .values({
        orgId,
        calendarId: input.calendarId,
        appointmentTypeId: input.appointmentTypeId,
        clientId: input.clientId ?? null,
        startAt: input.startAt,
        endAt: input.endAt,
        timezone: input.timezone,
        status: input.status,
        notes: input.notes ?? null,
      })
      .returning();
    return result!;
  }

  async update(
    tx: DbClient,
    id: string,
    input: AppointmentUpdateInput,
  ): Promise<Appointment | null> {
    // RLS already set by withRls() in service layer
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (input.clientId !== undefined) {
      updateData["clientId"] = input.clientId;
    }

    if (input.notes !== undefined) {
      updateData["notes"] = input.notes;
    }

    const [result] = await tx
      .update(appointments)
      .set(updateData)
      .where(eq(appointments.id, id))
      .returning();
    return result ?? null;
  }

  async updateStatus(
    tx: DbClient,
    id: string,
    status: string,
    notes?: string | null,
  ): Promise<Appointment | null> {
    // RLS already set by withRls() in service layer
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };

    if (notes !== undefined) {
      updateData["notes"] = notes;
    }

    const [result] = await tx
      .update(appointments)
      .set(updateData)
      .where(eq(appointments.id, id))
      .returning();
    return result ?? null;
  }

  async reschedule(
    tx: DbClient,
    id: string,
    input: AppointmentRescheduleInput,
  ): Promise<Appointment | null> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .update(appointments)
      .set({
        startAt: input.startAt,
        endAt: input.endAt,
        timezone: input.timezone,
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, id))
      .returning();
    return result ?? null;
  }

  // Verify calendar exists and belongs to org
  async verifyCalendarAccess(
    tx: DbClient,
    calendarId: string,
  ): Promise<boolean> {
    // RLS already set by withRls() in service layer
    const [calendar] = await tx
      .select({ id: calendars.id })
      .from(calendars)
      .where(eq(calendars.id, calendarId))
      .limit(1);
    return !!calendar;
  }

  // Verify client exists and belongs to org
  async verifyClientAccess(tx: DbClient, clientId: string): Promise<boolean> {
    // RLS already set by withRls() in service layer
    const [client] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    return !!client;
  }

  // Get appointment type with calendar link verification
  async getAppointmentTypeForCalendar(
    tx: DbClient,
    appointmentTypeId: string,
    calendarId: string,
  ): Promise<AppointmentTypeData | null> {
    // RLS already set by withRls() in service layer

    // First verify the appointment type exists
    const [appointmentType] = await tx
      .select()
      .from(appointmentTypes)
      .where(eq(appointmentTypes.id, appointmentTypeId))
      .limit(1);

    if (!appointmentType) {
      return null;
    }

    // Check if linked to calendar (this table has no RLS, use db directly)
    const [link] = await tx
      .select()
      .from(appointmentTypeCalendars)
      .where(
        and(
          eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId),
          eq(appointmentTypeCalendars.calendarId, calendarId),
        ),
      )
      .limit(1);

    if (!link) {
      return null;
    }

    return {
      id: appointmentType.id,
      name: appointmentType.name,
      durationMin: appointmentType.durationMin,
      paddingBeforeMin: appointmentType.paddingBeforeMin,
      paddingAfterMin: appointmentType.paddingAfterMin,
      capacity: appointmentType.capacity,
    };
  }

  // Get appointment type by ID (without calendar check)
  async getAppointmentType(
    tx: DbClient,
    appointmentTypeId: string,
  ): Promise<AppointmentTypeData | null> {
    // RLS already set by withRls() in service layer
    const [result] = await tx
      .select()
      .from(appointmentTypes)
      .where(eq(appointmentTypes.id, appointmentTypeId))
      .limit(1);

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      name: result.name,
      durationMin: result.durationMin,
      paddingBeforeMin: result.paddingBeforeMin,
      paddingAfterMin: result.paddingAfterMin,
      capacity: result.capacity,
    };
  }

  // Count overlapping appointments for capacity check
  async countOverlappingAppointments(
    tx: DbClient,
    calendarId: string,
    startAt: Date,
    endAt: Date,
    excludeAppointmentId?: string,
  ): Promise<number> {
    // RLS already set by withRls() in service layer

    const conditions = [
      eq(appointments.calendarId, calendarId),
      ne(appointments.status, "cancelled"),
      or(
        and(lte(appointments.startAt, endAt), gte(appointments.endAt, startAt)),
      ),
    ].filter(Boolean);

    if (excludeAppointmentId) {
      conditions.push(ne(appointments.id, excludeAppointmentId));
    }

    const results = await tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(...conditions));

    return results.length;
  }
}

// Singleton instance
export const appointmentRepository = new AppointmentRepository();
