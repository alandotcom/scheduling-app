// oRPC routes for appointments CRUD - thin handlers delegating to service layer

import { z } from "zod";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema,
  listAppointmentsQuerySchema,
  appointmentTimeRangeQuerySchema,
  appointmentTimeRangeResponseSchema,
  appointmentListResponseSchema,
  appointmentWithRelationsSchema,
  appointmentResponseSchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { appointmentService } from "../services/appointments.js";

const idInput = z.object({ id: z.uuid() });

// List appointments with cursor pagination and filters
export const list = authed
  .route({
    method: "GET",
    path: "/appointments",
    tags: ["Appointments"],
    summary: "List appointments",
    description:
      "Returns paginated appointments for the active organization with optional filters.",
  })
  .input(listAppointmentsQuerySchema)
  .output(appointmentListResponseSchema)
  .handler(async ({ input, context }) => {
    return appointmentService.list(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// List appointments for schedule view (time-range)
export const range = authed
  .route({
    method: "GET",
    path: "/appointments/range",
    tags: ["Appointments"],
    summary: "List appointments by time range",
    description:
      "Returns appointments in a date-time window for schedule views and availability checks.",
  })
  .input(appointmentTimeRangeQuerySchema)
  .output(appointmentTimeRangeResponseSchema)
  .handler(async ({ input, context }) => {
    const result = await appointmentService.listRange(
      {
        startAt: input.startAt,
        endAt: input.endAt,
        calendarId: input.calendarId ?? null,
        appointmentTypeId: input.appointmentTypeId ?? null,
        clientId: input.clientId ?? null,
        status: input.status ?? null,
        cursor: input.cursor ?? null,
        limit: input.limit,
      },
      {
        orgId: context.orgId,
        userId: context.userId,
      },
    );
    return appointmentTimeRangeResponseSchema.parse(result);
  });

// Get single appointment by ID
export const get = authed
  .route({
    method: "GET",
    path: "/appointments/{id}",
    tags: ["Appointments"],
    summary: "Get appointment",
    description: "Returns a single appointment and its related entities by ID.",
  })
  .input(idInput)
  .output(appointmentWithRelationsSchema)
  .handler(async ({ input, context }) => {
    return appointmentService.get(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Create appointment with availability check
export const create = authed
  .route({
    method: "POST",
    path: "/appointments",
    successStatus: 201,
    tags: ["Appointments"],
    summary: "Create appointment",
    description:
      "Creates a new appointment after validating availability constraints.",
  })
  .input(createAppointmentSchema)
  .output(appointmentResponseSchema)
  .handler(async ({ input, context }) => {
    return appointmentService.create(input, {
      orgId: context.orgId,
      userId: context.userId,
      authMethod: context.authMethod,
    });
  });

// Update appointment details (notes, clientId only)
export const update = authed
  .route({
    method: "PATCH",
    path: "/appointments/{id}",
    tags: ["Appointments"],
    summary: "Update appointment",
    description:
      "Updates mutable appointment fields such as notes and assigned client.",
  })
  .input(idInput.extend(updateAppointmentSchema.shape))
  .output(appointmentResponseSchema)
  .handler(async ({ input, context }) => {
    const { id, ...data } = input;
    return appointmentService.update(id, data, {
      orgId: context.orgId,
      userId: context.userId,
      authMethod: context.authMethod,
    });
  });

// Cancel appointment
export const cancel = authed
  .route({
    method: "DELETE",
    path: "/appointments/{id}",
    tags: ["Appointments"],
    summary: "Cancel appointment",
    description:
      "Cancels an appointment by ID and records cancellation metadata when provided.",
  })
  .input(idInput.extend(cancelAppointmentSchema.shape))
  .output(appointmentResponseSchema)
  .handler(async ({ input, context }) => {
    const { id, ...data } = input;
    return appointmentService.cancel(id, data, {
      orgId: context.orgId,
      userId: context.userId,
      authMethod: context.authMethod,
    });
  });

// Reschedule appointment to new time
export const reschedule = authed
  .route({
    method: "POST",
    path: "/appointments/{id}/reschedule",
    tags: ["Appointments"],
    summary: "Reschedule appointment",
    description:
      "Reschedules an existing appointment to a new start/end time without cancelling.",
  })
  .input(idInput.extend(rescheduleAppointmentSchema.shape))
  .output(appointmentResponseSchema)
  .handler(async ({ input, context }) => {
    const { id, ...data } = input;
    return appointmentService.reschedule(id, data, {
      orgId: context.orgId,
      userId: context.userId,
      authMethod: context.authMethod,
    });
  });

// Confirm appointment
export const confirm = authed
  .route({
    method: "POST",
    path: "/appointments/{id}/confirm",
    tags: ["Appointments"],
    summary: "Confirm appointment",
    description: "Marks an appointment as confirmed.",
  })
  .input(idInput)
  .output(appointmentResponseSchema)
  .handler(async ({ input, context }) => {
    return appointmentService.confirm(input.id, {
      orgId: context.orgId,
      userId: context.userId,
      authMethod: context.authMethod,
    });
  });

// Mark appointment as no-show
export const noShow = authed
  .route({
    method: "POST",
    path: "/appointments/{id}/no-show",
    tags: ["Appointments"],
    summary: "Mark appointment as no-show",
    description:
      "Records an appointment attendee as no-show without creating a cancellation.",
  })
  .input(idInput)
  .output(appointmentResponseSchema)
  .handler(async ({ input, context }) => {
    return appointmentService.noShow(input.id, {
      orgId: context.orgId,
      userId: context.userId,
      authMethod: context.authMethod,
    });
  });

// Route exports
export const appointmentRoutes = {
  list,
  range,
  get,
  create,
  update,
  cancel,
  reschedule,
  confirm,
  noShow,
};
