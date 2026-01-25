// oRPC routes for appointments CRUD - thin handlers delegating to service layer

import { z } from "zod";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema,
  listAppointmentsQuerySchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { appointmentService } from "../services/appointments.js";

const idInput = z.object({ id: z.string().uuid() });

// List appointments with cursor pagination and filters
export const list = authed
  .input(listAppointmentsQuerySchema)
  .handler(async ({ input, context }) => {
    return appointmentService.list(input, {
      orgId: context.orgId,
      userId: context.userId!,
    });
  });

// Get single appointment by ID
export const get = authed.input(idInput).handler(async ({ input, context }) => {
  return appointmentService.get(input.id, {
    orgId: context.orgId,
    userId: context.userId!,
  });
});

// Create appointment with availability check
export const create = authed
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
  get,
  create,
  update,
  cancel,
  reschedule,
  noShow,
};
