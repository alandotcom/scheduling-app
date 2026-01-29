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
} from "@scheduling/dto";
import { authed } from "./base.js";
import { appointmentService } from "../services/appointments.js";

const idInput = z.object({ id: z.string().uuid() });

// List appointments with cursor pagination and filters
export const list = authed
  .route({ method: "GET", path: "/appointments" })
  .input(listAppointmentsQuerySchema)
  .output(appointmentListResponseSchema)
  .handler(async ({ input, context }) => {
    return appointmentService.list(input, {
      orgId: context.orgId,
      userId: context.userId!,
    });
  });

// List appointments for schedule view (time-range)
export const range = authed
  .route({ method: "GET", path: "/appointments/range" })
  .input(appointmentTimeRangeQuerySchema)
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
        userId: context.userId!,
      },
    );
    return appointmentTimeRangeResponseSchema.parse(result);
  });

// Get single appointment by ID
export const get = authed
  .route({ method: "GET", path: "/appointments/{id}" })
  .input(idInput)
  .output(appointmentWithRelationsSchema)
  .handler(async ({ input, context }) => {
    return appointmentService.get(input.id, {
      orgId: context.orgId,
      userId: context.userId!,
    });
  });

// Create appointment with availability check
export const create = authed
  .route({ method: "POST", path: "/appointments", successStatus: 201 })
  .input(createAppointmentSchema)
  .handler(async ({ input, context }) => {
    return appointmentService.create(input, {
      orgId: context.orgId,
      userId: context.userId!,
      authMethod: context.authMethod,
    });
  });

// Update appointment details (notes, clientId only)
export const update = authed
  .route({ method: "PATCH", path: "/appointments/{id}" })
  .input(idInput.merge(z.object({ data: updateAppointmentSchema })))
  .handler(async ({ input, context }) => {
    return appointmentService.update(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId!,
      authMethod: context.authMethod,
    });
  });

// Cancel appointment
export const cancel = authed
  .route({ method: "DELETE", path: "/appointments/{id}" })
  .input(idInput.merge(z.object({ data: cancelAppointmentSchema.optional() })))
  .handler(async ({ input, context }) => {
    return appointmentService.cancel(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId!,
      authMethod: context.authMethod,
    });
  });

// Reschedule appointment to new time
export const reschedule = authed
  .route({ method: "POST", path: "/appointments/{id}/reschedule" })
  .input(idInput.merge(z.object({ data: rescheduleAppointmentSchema })))
  .handler(async ({ input, context }) => {
    return appointmentService.reschedule(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId!,
      authMethod: context.authMethod,
    });
  });

// Mark appointment as no-show
export const noShow = authed
  .route({ method: "POST", path: "/appointments/{id}/no-show" })
  .input(idInput)
  .handler(async ({ input, context }) => {
    return appointmentService.noShow(input.id, {
      orgId: context.orgId,
      userId: context.userId!,
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
  noShow,
};
