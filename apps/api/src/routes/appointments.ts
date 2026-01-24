// oRPC routes for appointments CRUD with rule enforcement
// - List with cursor pagination and filters
// - Create with availability check and transaction locking
// - Update details (notes, clientId only)
// - Cancel, reschedule, no-show operations
// - Race condition prevention with serializable transactions and retry logic

import { z } from "zod";
import { eq, and, gt, gte, lte, ne, sql, or } from "drizzle-orm";
import { DateTime } from "luxon";
import {
  appointments,
  calendars,
  clients,
  appointmentTypes,
  appointmentTypeCalendars,
} from "@scheduling/db/schema";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema,
  listAppointmentsQuerySchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { db, withOrg } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import { AvailabilityEngine } from "../services/availability-engine/index.js";
import { events } from "../services/jobs/emitter.js";
import { recordAudit, toAuditSnapshot, createAuditContext } from "../services/audit.js";

const idInput = z.object({ id: z.string().uuid() });

// Serialization error code from PostgreSQL
const SERIALIZATION_FAILURE = "40001";

// Retry configuration
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 50;

// Helper to run a function with retry on serialization failure
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      // Check if it's a serialization failure
      if (error?.code === SERIALIZATION_FAILURE) {
        lastError = error;
        // Exponential backoff: 50ms, 100ms, 150ms
        await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS * (attempt + 1)));
        continue;
      }
      // Not a serialization failure, don't retry
      throw error;
    }
  }
  // All retries exhausted
  throw lastError;
}

// Helper to verify calendar belongs to org
async function verifyCalendarAccess(orgId: string, calendarId: string) {
  const [calendar] = await withOrg(orgId, async (tx) => {
    return tx.select().from(calendars).where(eq(calendars.id, calendarId)).limit(1);
  });
  if (!calendar) {
    throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
  }
  return calendar;
}

// Helper to verify client belongs to org
async function verifyClientAccess(orgId: string, clientId: string) {
  const [client] = await withOrg(orgId, async (tx) => {
    return tx.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  });
  if (!client) {
    throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
  }
  return client;
}

// Helper to verify appointment type exists and is linked to calendar
async function verifyAppointmentTypeAndCalendar(
  orgId: string,
  appointmentTypeId: string,
  calendarId: string,
) {
  const [appointmentType] = await withOrg(orgId, async (tx) => {
    return tx
      .select()
      .from(appointmentTypes)
      .where(eq(appointmentTypes.id, appointmentTypeId))
      .limit(1);
  });
  if (!appointmentType) {
    throw new ApplicationError("Appointment type not found", { code: "NOT_FOUND" });
  }

  // Check if this appointment type is linked to this calendar
  const [link] = await db
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
    throw new ApplicationError("Appointment type is not available on this calendar", {
      code: "BAD_REQUEST",
    });
  }

  return appointmentType;
}

// ============================================================================
// LIST APPOINTMENTS
// ============================================================================

export const list = authed
  .input(listAppointmentsQuerySchema)
  .handler(async ({ input, context }) => {
    const { cursor, limit, calendarId, appointmentTypeId, clientId, status, startDate, endDate } =
      input;
    const { orgId } = context;

    const results = await withOrg(orgId, async (tx) => {
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
        const startDateTime = DateTime.fromISO(startDate).startOf("day").toJSDate();
        conditions.push(gte(appointments.startAt, startDateTime));
      }

      if (endDate) {
        const endDateTime = DateTime.fromISO(endDate).endOf("day").toJSDate();
        conditions.push(lte(appointments.startAt, endDateTime));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      return tx
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
        .leftJoin(appointmentTypes, eq(appointments.appointmentTypeId, appointmentTypes.id))
        .leftJoin(clients, eq(appointments.clientId, clients.id))
        .where(whereClause)
        .limit(limit + 1)
        .orderBy(appointments.id);
    });

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    // Transform to response format
    const transformedItems = items.map((row) => ({
      ...row.appointment,
      calendar: row.calendar ?? undefined,
      appointmentType: row.appointmentType ?? undefined,
      client: row.client ?? undefined,
    }));

    return {
      items: transformedItems,
      nextCursor: hasMore ? (items[items.length - 1]?.appointment.id ?? null) : null,
      hasMore,
    };
  });

// ============================================================================
// GET SINGLE APPOINTMENT
// ============================================================================

export const get = authed.input(idInput).handler(async ({ input, context }) => {
  const { id } = input;
  const { orgId } = context;

  const results = await withOrg(orgId, async (tx) => {
    return tx
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
      .leftJoin(appointmentTypes, eq(appointments.appointmentTypeId, appointmentTypes.id))
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .where(eq(appointments.id, id))
      .limit(1);
  });

  if (results.length === 0) {
    throw new ApplicationError("Appointment not found", { code: "NOT_FOUND" });
  }

  const row = results[0]!;
  return {
    ...row.appointment,
    calendar: row.calendar ?? undefined,
    appointmentType: row.appointmentType ?? undefined,
    client: row.client ?? undefined,
  };
});

// ============================================================================
// CREATE APPOINTMENT
// ============================================================================

export const create = authed.input(createAppointmentSchema).handler(async ({ input, context }) => {
  const { calendarId, appointmentTypeId, startTime, timezone, clientId, notes } = input;
  const { orgId } = context;

  // Validate calendar access
  await verifyCalendarAccess(orgId, calendarId);

  // Validate client if provided
  if (clientId) {
    await verifyClientAccess(orgId, clientId);
  }

  // Get and validate appointment type + calendar link
  const appointmentType = await verifyAppointmentTypeAndCalendar(
    orgId,
    appointmentTypeId,
    calendarId,
  );

  // Parse start time and calculate end time
  const startAt = new Date(startTime);
  const endAt = DateTime.fromJSDate(startAt)
    .plus({ minutes: appointmentType.durationMin })
    .toJSDate();

  // Check if booking is in the past
  if (startAt < new Date()) {
    throw new ApplicationError("BOOKING_IN_PAST: Cannot book appointments in the past", {
      code: "UNPROCESSABLE_CONTENT",
    });
  }

  // Check availability using the engine
  const engine = new AvailabilityEngine(db);
  const availabilityCheck = await engine.checkSlot(
    appointmentTypeId,
    calendarId,
    startAt,
    timezone,
  );

  if (!availabilityCheck.available) {
    const errorCode = availabilityCheck.reason || "SLOT_UNAVAILABLE";
    throw new ApplicationError(`${errorCode}: Time slot is not available`, {
      code: "CONFLICT",
    });
  }

  // Create appointment with serializable transaction and locking
  const appointment = await withRetry(async () => {
    return db.transaction(
      async (tx) => {
        // Lock the calendar row to prevent concurrent bookings
        await tx.execute(sql`SELECT id FROM calendars WHERE id = ${calendarId} FOR UPDATE`);

        // Set org context for RLS
        await tx.execute(sql`SET LOCAL app.current_org_id = ${orgId}`);

        // Double-check for overlapping appointments (with padding consideration)
        const paddingBeforeMin = appointmentType.paddingBeforeMin ?? 0;
        const paddingAfterMin = appointmentType.paddingAfterMin ?? 0;
        const capacity = appointmentType.capacity ?? 1;

        const paddedStartAt = DateTime.fromJSDate(startAt)
          .minus({ minutes: paddingBeforeMin })
          .toJSDate();
        const paddedEndAt = DateTime.fromJSDate(endAt)
          .plus({ minutes: paddingAfterMin })
          .toJSDate();

        const overlappingAppointments = await tx
          .select()
          .from(appointments)
          .where(
            and(
              eq(appointments.calendarId, calendarId),
              ne(appointments.status, "cancelled"),
              // Check for overlap: start < other_end AND end > other_start
              or(
                and(lte(appointments.startAt, paddedEndAt), gte(appointments.endAt, paddedStartAt)),
              ),
            ),
          );

        if (overlappingAppointments.length >= capacity) {
          throw new ApplicationError("SLOT_UNAVAILABLE: Time slot is no longer available", {
            code: "CONFLICT",
          });
        }

        // Insert the appointment
        const [inserted] = await tx
          .insert(appointments)
          .values({
            orgId,
            calendarId,
            appointmentTypeId,
            clientId: clientId ?? null,
            startAt,
            endAt,
            timezone,
            status: "scheduled",
            notes: notes ?? null,
          })
          .returning();

        return inserted!;
      },
      { isolationLevel: "serializable" },
    );
  });

  // Emit appointment created event
  await events.appointmentCreated(orgId, {
    appointmentId: appointment.id,
    calendarId: appointment.calendarId,
    appointmentTypeId: appointment.appointmentTypeId,
    clientId: appointment.clientId,
    startAt: appointment.startAt.toISOString(),
    endAt: appointment.endAt.toISOString(),
    timezone: appointment.timezone,
    status: appointment.status,
  });

  // Record audit event
  const authMethod =
    context.authMethod === "token"
      ? "api_token"
      : context.authMethod === "session"
        ? "session"
        : "none";
  await recordAudit(createAuditContext(orgId, context.userId, authMethod), {
    action: "create",
    entityType: "appointment",
    entityId: appointment.id,
    before: null,
    after: toAuditSnapshot(appointment as unknown as Record<string, unknown>),
  });

  return appointment;
});

// ============================================================================
// UPDATE APPOINTMENT
// ============================================================================

export const update = authed
  .input(idInput.merge(z.object({ data: updateAppointmentSchema })))
  .handler(async ({ input, context }) => {
    const { id, data } = input;
    const { orgId } = context;

    // Get existing appointment
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx.select().from(appointments).where(eq(appointments.id, id)).limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Appointment not found", { code: "NOT_FOUND" });
    }

    // Validate client if being updated
    if (data.clientId !== undefined && data.clientId !== null) {
      await verifyClientAccess(orgId, data.clientId);
    }

    // Build update object
    const updateData: {
      updatedAt: Date;
      clientId?: string | null;
      notes?: string | null;
    } = {
      updatedAt: new Date(),
    };

    if (data.clientId !== undefined) {
      updateData.clientId = data.clientId;
    }

    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    const [updated] = await withOrg(orgId, async (tx) => {
      return tx.update(appointments).set(updateData).where(eq(appointments.id, id)).returning();
    });

    // Emit appointment updated event
    await events.appointmentUpdated(orgId, {
      appointmentId: updated!.id,
      changes: data,
      previousClientId: existing.clientId,
      previousNotes: existing.notes,
    });

    // Record audit event
    const authMethod =
      context.authMethod === "token"
        ? "api_token"
        : context.authMethod === "session"
          ? "session"
          : "none";
    await recordAudit(createAuditContext(orgId, context.userId, authMethod), {
      action: "update",
      entityType: "appointment",
      entityId: updated!.id,
      before: toAuditSnapshot(existing as unknown as Record<string, unknown>),
      after: toAuditSnapshot(updated as unknown as Record<string, unknown>),
    });

    return updated!;
  });

// ============================================================================
// CANCEL APPOINTMENT
// ============================================================================

export const cancel = authed
  .input(idInput.merge(z.object({ data: cancelAppointmentSchema.optional() })))
  .handler(async ({ input, context }) => {
    const { id, data } = input;
    const { orgId } = context;

    // Get existing appointment
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx.select().from(appointments).where(eq(appointments.id, id)).limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Appointment not found", { code: "NOT_FOUND" });
    }

    if (existing.status === "cancelled") {
      throw new ApplicationError("APPOINTMENT_ALREADY_CANCELLED: Appointment is already cancelled", {
        code: "UNPROCESSABLE_CONTENT",
      });
    }

    // Update status to cancelled
    const [updated] = await withOrg(orgId, async (tx) => {
      return tx
        .update(appointments)
        .set({
          status: "cancelled",
          notes: data?.reason
            ? `${existing.notes ? existing.notes + "\n" : ""}Cancelled: ${data.reason}`
            : existing.notes,
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, id))
        .returning();
    });

    // Emit appointment cancelled event
    await events.appointmentCancelled(orgId, {
      appointmentId: updated!.id,
      calendarId: updated!.calendarId,
      appointmentTypeId: updated!.appointmentTypeId,
      clientId: updated!.clientId,
      startAt: updated!.startAt.toISOString(),
      endAt: updated!.endAt.toISOString(),
      reason: data?.reason,
    });

    // Record audit event
    const authMethod =
      context.authMethod === "token"
        ? "api_token"
        : context.authMethod === "session"
          ? "session"
          : "none";
    await recordAudit(
      createAuditContext(orgId, context.userId, authMethod, { reason: data?.reason }),
      {
        action: "cancel",
        entityType: "appointment",
        entityId: updated!.id,
        before: toAuditSnapshot(existing as unknown as Record<string, unknown>),
        after: toAuditSnapshot(updated as unknown as Record<string, unknown>),
      },
    );

    return updated!;
  });

// ============================================================================
// RESCHEDULE APPOINTMENT
// ============================================================================

export const reschedule = authed
  .input(idInput.merge(z.object({ data: rescheduleAppointmentSchema })))
  .handler(async ({ input, context }) => {
    const { id, data } = input;
    const { orgId } = context;

    // Get existing appointment
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx.select().from(appointments).where(eq(appointments.id, id)).limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Appointment not found", { code: "NOT_FOUND" });
    }

    if (existing.status === "cancelled") {
      throw new ApplicationError(
        "APPOINTMENT_ALREADY_CANCELLED: Cannot reschedule a cancelled appointment",
        {
          code: "UNPROCESSABLE_CONTENT",
        },
      );
    }

    // Get appointment type for duration
    const [appointmentType] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, existing.appointmentTypeId))
        .limit(1);
    });

    if (!appointmentType) {
      throw new ApplicationError("Appointment type not found", { code: "NOT_FOUND" });
    }

    // Parse new times
    const newStartAt = new Date(data.newStartTime);
    const newEndAt = DateTime.fromJSDate(newStartAt)
      .plus({ minutes: appointmentType.durationMin })
      .toJSDate();

    // Check if new time is in the past
    if (newStartAt < new Date()) {
      throw new ApplicationError("BOOKING_IN_PAST: Cannot reschedule to a time in the past", {
        code: "UNPROCESSABLE_CONTENT",
      });
    }

    // Check availability for the new slot
    const engine = new AvailabilityEngine(db);
    const availabilityCheck = await engine.checkSlot(
      existing.appointmentTypeId,
      existing.calendarId,
      newStartAt,
      data.timezone,
    );

    // The slot might show as unavailable because the current appointment occupies it
    // We need to check if the only conflict is with itself
    if (!availabilityCheck.available && availabilityCheck.reason !== "SLOT_UNAVAILABLE") {
      const errorCode = availabilityCheck.reason || "SLOT_UNAVAILABLE";
      throw new ApplicationError(`${errorCode}: New time slot is not available`, {
        code: "CONFLICT",
      });
    }

    // Reschedule with serializable transaction
    const updated = await withRetry(async () => {
      return db.transaction(
        async (tx) => {
          // Lock the calendar row
          await tx.execute(
            sql`SELECT id FROM calendars WHERE id = ${existing.calendarId} FOR UPDATE`,
          );

          // Set org context for RLS
          await tx.execute(sql`SET LOCAL app.current_org_id = ${orgId}`);

          // Check for overlapping appointments (excluding this one)
          const paddingBeforeMin = appointmentType.paddingBeforeMin ?? 0;
          const paddingAfterMin = appointmentType.paddingAfterMin ?? 0;
          const capacity = appointmentType.capacity ?? 1;

          const paddedStartAt = DateTime.fromJSDate(newStartAt)
            .minus({ minutes: paddingBeforeMin })
            .toJSDate();
          const paddedEndAt = DateTime.fromJSDate(newEndAt)
            .plus({ minutes: paddingAfterMin })
            .toJSDate();

          const overlappingAppointments = await tx
            .select()
            .from(appointments)
            .where(
              and(
                eq(appointments.calendarId, existing.calendarId),
                ne(appointments.status, "cancelled"),
                ne(appointments.id, id), // Exclude this appointment
                or(
                  and(
                    lte(appointments.startAt, paddedEndAt),
                    gte(appointments.endAt, paddedStartAt),
                  ),
                ),
              ),
            );

          if (overlappingAppointments.length >= capacity) {
            throw new ApplicationError("SLOT_UNAVAILABLE: New time slot is no longer available", {
              code: "CONFLICT",
            });
          }

          // Update the appointment
          const [updated] = await tx
            .update(appointments)
            .set({
              startAt: newStartAt,
              endAt: newEndAt,
              timezone: data.timezone,
              updatedAt: new Date(),
            })
            .where(eq(appointments.id, id))
            .returning();

          return updated!;
        },
        { isolationLevel: "serializable" },
      );
    });

    // Emit appointment rescheduled event
    await events.appointmentRescheduled(orgId, {
      appointmentId: updated.id,
      calendarId: updated.calendarId,
      appointmentTypeId: updated.appointmentTypeId,
      clientId: updated.clientId,
      previousStartAt: existing.startAt.toISOString(),
      previousEndAt: existing.endAt.toISOString(),
      newStartAt: updated.startAt.toISOString(),
      newEndAt: updated.endAt.toISOString(),
      timezone: updated.timezone,
    });

    // Record audit event
    const authMethod =
      context.authMethod === "token"
        ? "api_token"
        : context.authMethod === "session"
          ? "session"
          : "none";
    await recordAudit(createAuditContext(orgId, context.userId, authMethod), {
      action: "reschedule",
      entityType: "appointment",
      entityId: updated.id,
      before: toAuditSnapshot(existing as unknown as Record<string, unknown>),
      after: toAuditSnapshot(updated as unknown as Record<string, unknown>),
    });

    return updated;
  });

// ============================================================================
// NO-SHOW APPOINTMENT
// ============================================================================

export const noShow = authed.input(idInput).handler(async ({ input, context }) => {
  const { id } = input;
  const { orgId } = context;

  // Get existing appointment
  const [existing] = await withOrg(orgId, async (tx) => {
    return tx.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  });

  if (!existing) {
    throw new ApplicationError("Appointment not found", { code: "NOT_FOUND" });
  }

  if (existing.status === "cancelled") {
    throw new ApplicationError(
      "APPOINTMENT_ALREADY_CANCELLED: Cannot mark a cancelled appointment as no-show",
      {
        code: "UNPROCESSABLE_CONTENT",
      },
    );
  }

  if (existing.status === "no_show") {
    throw new ApplicationError(
      "APPOINTMENT_ALREADY_NO_SHOW: Appointment is already marked as no-show",
      {
        code: "UNPROCESSABLE_CONTENT",
      },
    );
  }

  // Update status to no_show
  const [updated] = await withOrg(orgId, async (tx) => {
    return tx
      .update(appointments)
      .set({
        status: "no_show",
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, id))
      .returning();
  });

  // Emit appointment no_show event
  await events.appointmentNoShow(orgId, {
    appointmentId: updated!.id,
    calendarId: updated!.calendarId,
    appointmentTypeId: updated!.appointmentTypeId,
    clientId: updated!.clientId,
    startAt: updated!.startAt.toISOString(),
    endAt: updated!.endAt.toISOString(),
  });

  // Record audit event
  const authMethod =
    context.authMethod === "token"
      ? "api_token"
      : context.authMethod === "session"
        ? "session"
        : "none";
  await recordAudit(createAuditContext(orgId, context.userId, authMethod), {
    action: "no_show",
    entityType: "appointment",
    entityId: updated!.id,
    before: toAuditSnapshot(existing as unknown as Record<string, unknown>),
    after: toAuditSnapshot(updated as unknown as Record<string, unknown>),
  });

  return updated!;
});

// ============================================================================
// ROUTE EXPORTS
// ============================================================================

export const appointmentRoutes = {
  list,
  get,
  create,
  update,
  cancel,
  reschedule,
  noShow,
};
