// Appointment service - business logic layer for appointments

import { DateTime } from "luxon";
import { appointmentRepository } from "../repositories/appointments.js";
import type {
  Appointment,
  AppointmentListInput,
  AppointmentWithRelations,
} from "../repositories/appointments.js";
import type { PaginatedResult } from "../repositories/base.js";
import { withOrg } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import { availabilityService } from "./availability-engine/index.js";
import { events } from "./jobs/emitter.js";
import { recordAudit, toAuditSnapshot, createAuditContext } from "./audit.js";
import type { ServiceContext } from "./locations.js";

// PostgreSQL exclusion constraint violation code
const EXCLUSION_CONSTRAINT_VIOLATION = "23P01";

// Helper to check if an error is an exclusion constraint violation
// Drizzle wraps Postgres errors in error.cause, and Bun's PostgresError uses errno for the code
function isExclusionConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  // Check direct code property
  if ("code" in error && error.code === EXCLUSION_CONSTRAINT_VIOLATION) {
    return true;
  }

  // Check cause (Drizzle wraps Postgres errors)
  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const cause = error.cause as Record<string, unknown>;
    // Bun's PostgresError uses errno for the Postgres error code
    if (cause["errno"] === EXCLUSION_CONSTRAINT_VIOLATION) {
      return true;
    }
    // Also check cause.code for compatibility
    if (cause["code"] === EXCLUSION_CONSTRAINT_VIOLATION) {
      return true;
    }
  }

  return false;
}

// Extended service context with auth method for audit
export interface AppointmentServiceContext extends ServiceContext {
  authMethod: "session" | "token" | null;
}

export interface CreateAppointmentInput {
  calendarId: string;
  appointmentTypeId: string;
  startTime: Date;
  timezone: string;
  clientId?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface UpdateAppointmentInput {
  clientId?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface RescheduleAppointmentInput {
  newStartTime: Date;
  timezone: string;
}

export interface CancelAppointmentInput {
  reason?: string | null | undefined;
}

// Transform joined result to response format
function toAppointmentResponse(row: AppointmentWithRelations) {
  return {
    ...row.appointment,
    calendar: row.calendar ?? undefined,
    appointmentType: row.appointmentType ?? undefined,
    client: row.client ?? undefined,
  };
}

export class AppointmentService {
  async list(
    input: AppointmentListInput,
    context: ServiceContext,
  ): Promise<PaginatedResult<ReturnType<typeof toAppointmentResponse>>> {
    const result = await withOrg(context.orgId, (tx) =>
      appointmentRepository.findMany(tx, context.orgId, input),
    );

    return {
      items: result.items.map(toAppointmentResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async get(
    id: string,
    context: ServiceContext,
  ): Promise<ReturnType<typeof toAppointmentResponse>> {
    return withOrg(context.orgId, async (tx) => {
      const result = await appointmentRepository.findByIdWithRelations(
        tx,
        context.orgId,
        id,
      );

      if (!result) {
        throw new ApplicationError("Appointment not found", {
          code: "NOT_FOUND",
        });
      }

      return toAppointmentResponse(result);
    });
  }

  async create(
    input: CreateAppointmentInput,
    context: AppointmentServiceContext,
  ): Promise<Appointment> {
    const {
      calendarId,
      appointmentTypeId,
      startTime,
      timezone,
      clientId,
      notes,
    } = input;
    const { orgId } = context;

    // Validate calendar access
    const calendarExists = await withOrg(orgId, (tx) =>
      appointmentRepository.verifyCalendarAccess(tx, orgId, calendarId),
    );
    if (!calendarExists) {
      throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
    }

    // Validate client if provided
    if (clientId) {
      const clientExists = await withOrg(orgId, (tx) =>
        appointmentRepository.verifyClientAccess(tx, orgId, clientId),
      );
      if (!clientExists) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }
    }

    // Get and validate appointment type + calendar link
    const appointmentType = await withOrg(orgId, (tx) =>
      appointmentRepository.getAppointmentTypeForCalendar(
        tx,
        orgId,
        appointmentTypeId,
        calendarId,
      ),
    );
    if (!appointmentType) {
      throw new ApplicationError(
        "Appointment type not found or not available on this calendar",
        { code: "NOT_FOUND" },
      );
    }

    // Calculate end time from start time
    const startAt = startTime;
    const endAt = DateTime.fromJSDate(startAt)
      .plus({ minutes: appointmentType.durationMin })
      .toJSDate();

    // Check if booking is in the past
    if (startAt < new Date()) {
      throw new ApplicationError(
        "BOOKING_IN_PAST: Cannot book appointments in the past",
        { code: "UNPROCESSABLE_CONTENT" },
      );
    }

    // Check availability using the service
    const availabilityCheck = await availabilityService.checkSlot(
      appointmentTypeId,
      calendarId,
      startAt,
      timezone,
      { orgId, userId: context.userId },
    );

    if (!availabilityCheck.available) {
      const errorCode = availabilityCheck.reason || "SLOT_UNAVAILABLE";
      throw new ApplicationError(`${errorCode}: Time slot is not available`, {
        code: "CONFLICT",
      });
    }

    // Create appointment - DB exclusion constraint handles race conditions
    let appointment: Appointment;
    try {
      appointment = await withOrg(orgId, (tx) =>
        appointmentRepository.create(tx, orgId, {
          calendarId,
          appointmentTypeId,
          clientId: clientId ?? null,
          startAt,
          endAt,
          timezone,
          status: "scheduled",
          notes: notes ?? null,
        }),
      );
    } catch (error: unknown) {
      // Check for exclusion constraint violation (23P01)
      if (isExclusionConstraintViolation(error)) {
        throw new ApplicationError(
          "SLOT_UNAVAILABLE: Time slot is no longer available",
          { code: "CONFLICT" },
        );
      }
      throw error;
    }

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
    const authMethod = this.mapAuthMethod(context.authMethod);
    await recordAudit(createAuditContext(orgId, context.userId, authMethod), {
      action: "create",
      entityType: "appointment",
      entityId: appointment.id,
      before: null,
      after: toAuditSnapshot(appointment as unknown as Record<string, unknown>),
    });

    return appointment;
  }

  async update(
    id: string,
    data: UpdateAppointmentInput,
    context: AppointmentServiceContext,
  ): Promise<Appointment> {
    const { orgId } = context;

    return withOrg(orgId, async (tx) => {
      // Get existing appointment
      const existing = await appointmentRepository.findById(tx, orgId, id);
      if (!existing) {
        throw new ApplicationError("Appointment not found", {
          code: "NOT_FOUND",
        });
      }

      // Validate client if being updated
      if (data.clientId !== undefined && data.clientId !== null) {
        const clientExists = await appointmentRepository.verifyClientAccess(
          tx,
          orgId,
          data.clientId,
        );
        if (!clientExists) {
          throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
        }
      }

      const updated = await appointmentRepository.update(tx, orgId, id, data);
      if (!updated) {
        throw new ApplicationError("Appointment not found", {
          code: "NOT_FOUND",
        });
      }

      // Emit appointment updated event
      await events.appointmentUpdated(
        orgId,
        {
          appointmentId: updated.id,
          changes: data,
          previousClientId: existing.clientId,
          previousNotes: existing.notes,
        },
        tx,
      );

      // Record audit event
      const authMethod = this.mapAuthMethod(context.authMethod);
      await recordAudit(
        createAuditContext(orgId, context.userId, authMethod),
        {
          action: "update",
          entityType: "appointment",
          entityId: updated.id,
          before: toAuditSnapshot(
            existing as unknown as Record<string, unknown>,
          ),
          after: toAuditSnapshot(updated as unknown as Record<string, unknown>),
        },
        tx,
      );

      return updated;
    });
  }

  async cancel(
    id: string,
    data: CancelAppointmentInput | undefined,
    context: AppointmentServiceContext,
  ): Promise<Appointment> {
    const { orgId } = context;

    return withOrg(orgId, async (tx) => {
      // Get existing appointment
      const existing = await appointmentRepository.findById(tx, orgId, id);
      if (!existing) {
        throw new ApplicationError("Appointment not found", {
          code: "NOT_FOUND",
        });
      }

      if (existing.status === "cancelled") {
        throw new ApplicationError(
          "APPOINTMENT_ALREADY_CANCELLED: Appointment is already cancelled",
          { code: "UNPROCESSABLE_CONTENT" },
        );
      }

      // Build notes with cancellation reason
      const updatedNotes = data?.reason
        ? `${existing.notes ? existing.notes + "\n" : ""}Cancelled: ${data.reason}`
        : existing.notes;

      const updated = await appointmentRepository.updateStatus(
        tx,
        orgId,
        id,
        "cancelled",
        updatedNotes,
      );
      if (!updated) {
        throw new ApplicationError("Appointment not found", {
          code: "NOT_FOUND",
        });
      }

      // Emit appointment cancelled event
      await events.appointmentCancelled(
        orgId,
        {
          appointmentId: updated.id,
          calendarId: updated.calendarId,
          appointmentTypeId: updated.appointmentTypeId,
          clientId: updated.clientId,
          startAt: updated.startAt.toISOString(),
          endAt: updated.endAt.toISOString(),
          reason: data?.reason,
        },
        tx,
      );

      // Record audit event
      const authMethod = this.mapAuthMethod(context.authMethod);
      await recordAudit(
        createAuditContext(orgId, context.userId, authMethod, {
          reason: data?.reason,
        }),
        {
          action: "cancel",
          entityType: "appointment",
          entityId: updated.id,
          before: toAuditSnapshot(
            existing as unknown as Record<string, unknown>,
          ),
          after: toAuditSnapshot(updated as unknown as Record<string, unknown>),
        },
        tx,
      );

      return updated;
    });
  }

  async reschedule(
    id: string,
    data: RescheduleAppointmentInput,
    context: AppointmentServiceContext,
  ): Promise<Appointment> {
    const { orgId } = context;

    // Get existing appointment first (outside transaction for validation)
    const existing = await withOrg(orgId, (tx) =>
      appointmentRepository.findById(tx, orgId, id),
    );
    if (!existing) {
      throw new ApplicationError("Appointment not found", {
        code: "NOT_FOUND",
      });
    }

    if (existing.status === "cancelled") {
      throw new ApplicationError(
        "APPOINTMENT_ALREADY_CANCELLED: Cannot reschedule a cancelled appointment",
        { code: "UNPROCESSABLE_CONTENT" },
      );
    }

    // Get appointment type for duration
    const appointmentType = await withOrg(orgId, (tx) =>
      appointmentRepository.getAppointmentType(
        tx,
        orgId,
        existing.appointmentTypeId,
      ),
    );
    if (!appointmentType) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    // Calculate end time from new start time
    const newStartAt = data.newStartTime;
    const newEndAt = DateTime.fromJSDate(newStartAt)
      .plus({ minutes: appointmentType.durationMin })
      .toJSDate();

    // Check if new time is in the past
    if (newStartAt < new Date()) {
      throw new ApplicationError(
        "BOOKING_IN_PAST: Cannot reschedule to a time in the past",
        { code: "UNPROCESSABLE_CONTENT" },
      );
    }

    // Check availability for the new slot
    const availabilityCheck = await availabilityService.checkSlot(
      existing.appointmentTypeId,
      existing.calendarId,
      newStartAt,
      data.timezone,
      { orgId, userId: context.userId },
    );

    // If slot is unavailable, throw an error
    // SLOT_UNAVAILABLE means another appointment occupies the slot
    // (the current appointment being rescheduled doesn't count since it's moving away)
    if (!availabilityCheck.available) {
      const errorCode = availabilityCheck.reason || "SLOT_UNAVAILABLE";
      throw new ApplicationError(
        `${errorCode}: New time slot is not available`,
        { code: "CONFLICT" },
      );
    }

    // Perform reschedule - DB exclusion constraint handles race conditions
    let updated: Appointment;
    try {
      updated = await withOrg(orgId, async (tx) => {
        const result = await appointmentRepository.reschedule(tx, orgId, id, {
          startAt: newStartAt,
          endAt: newEndAt,
          timezone: data.timezone,
        });
        if (!result) {
          throw new ApplicationError("Appointment not found", {
            code: "NOT_FOUND",
          });
        }

        // Emit appointment rescheduled event within transaction
        await events.appointmentRescheduled(
          orgId,
          {
            appointmentId: result.id,
            calendarId: result.calendarId,
            appointmentTypeId: result.appointmentTypeId,
            clientId: result.clientId,
            previousStartAt: existing.startAt.toISOString(),
            previousEndAt: existing.endAt.toISOString(),
            newStartAt: result.startAt.toISOString(),
            newEndAt: result.endAt.toISOString(),
            timezone: result.timezone,
          },
          tx,
        );

        // Record audit event within transaction
        const authMethod = this.mapAuthMethod(context.authMethod);
        await recordAudit(
          createAuditContext(orgId, context.userId, authMethod),
          {
            action: "reschedule",
            entityType: "appointment",
            entityId: result.id,
            before: toAuditSnapshot(
              existing as unknown as Record<string, unknown>,
            ),
            after: toAuditSnapshot(
              result as unknown as Record<string, unknown>,
            ),
          },
          tx,
        );

        return result;
      });
    } catch (error: unknown) {
      // Check for exclusion constraint violation (23P01)
      if (isExclusionConstraintViolation(error)) {
        throw new ApplicationError(
          "SLOT_UNAVAILABLE: New time slot is no longer available",
          { code: "CONFLICT" },
        );
      }
      throw error;
    }

    return updated;
  }

  async noShow(
    id: string,
    context: AppointmentServiceContext,
  ): Promise<Appointment> {
    const { orgId } = context;

    return withOrg(orgId, async (tx) => {
      // Get existing appointment
      const existing = await appointmentRepository.findById(tx, orgId, id);
      if (!existing) {
        throw new ApplicationError("Appointment not found", {
          code: "NOT_FOUND",
        });
      }

      if (existing.status === "cancelled") {
        throw new ApplicationError(
          "APPOINTMENT_ALREADY_CANCELLED: Cannot mark a cancelled appointment as no-show",
          { code: "UNPROCESSABLE_CONTENT" },
        );
      }

      if (existing.status === "no_show") {
        throw new ApplicationError(
          "APPOINTMENT_ALREADY_NO_SHOW: Appointment is already marked as no-show",
          { code: "UNPROCESSABLE_CONTENT" },
        );
      }

      const updated = await appointmentRepository.updateStatus(
        tx,
        orgId,
        id,
        "no_show",
      );
      if (!updated) {
        throw new ApplicationError("Appointment not found", {
          code: "NOT_FOUND",
        });
      }

      // Emit appointment no_show event
      await events.appointmentNoShow(
        orgId,
        {
          appointmentId: updated.id,
          calendarId: updated.calendarId,
          appointmentTypeId: updated.appointmentTypeId,
          clientId: updated.clientId,
          startAt: updated.startAt.toISOString(),
          endAt: updated.endAt.toISOString(),
        },
        tx,
      );

      // Record audit event
      const authMethod = this.mapAuthMethod(context.authMethod);
      await recordAudit(
        createAuditContext(orgId, context.userId, authMethod),
        {
          action: "no_show",
          entityType: "appointment",
          entityId: updated.id,
          before: toAuditSnapshot(
            existing as unknown as Record<string, unknown>,
          ),
          after: toAuditSnapshot(updated as unknown as Record<string, unknown>),
        },
        tx,
      );

      return updated;
    });
  }

  private mapAuthMethod(
    authMethod: "session" | "token" | null,
  ): "session" | "api_token" | "none" {
    if (authMethod === "token") return "api_token";
    if (authMethod === "session") return "session";
    return "none";
  }
}

// Singleton instance
export const appointmentService = new AppointmentService();
