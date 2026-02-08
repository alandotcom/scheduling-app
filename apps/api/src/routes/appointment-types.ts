// oRPC routes for appointment types CRUD with calendar/resource associations

import { z } from "zod";
import {
  createAppointmentTypeSchema,
  updateAppointmentTypeSchema,
  listAppointmentTypesQuerySchema,
  createAppointmentTypeCalendarSchema,
  createAppointmentTypeResourceSchema,
  updateAppointmentTypeResourceSchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { appointmentTypeService } from "../services/appointment-types.js";

// List appointment types with cursor pagination
export const list = authed
  .route({ method: "GET", path: "/appointment-types" })
  .input(listAppointmentTypesQuerySchema)
  .handler(async ({ input, context }) => {
    return appointmentTypeService.list(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Get single appointment type by ID (with linked calendars/resources)
export const get = authed
  .route({ method: "GET", path: "/appointment-types/{id}" })
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    return appointmentTypeService.get(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Create appointment type
export const create = authed
  .route({ method: "POST", path: "/appointment-types", successStatus: 201 })
  .input(createAppointmentTypeSchema)
  .handler(async ({ input, context }) => {
    return appointmentTypeService.create(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Update appointment type
export const update = authed
  .route({ method: "PATCH", path: "/appointment-types/{id}" })
  .input(
    z.object({
      id: z.string().uuid(),
      data: updateAppointmentTypeSchema,
    }),
  )
  .handler(async ({ input, context }) => {
    return appointmentTypeService.update(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Delete appointment type
export const remove = authed
  .route({ method: "DELETE", path: "/appointment-types/{id}" })
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    return appointmentTypeService.delete(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// ============================================================================
// CALENDAR ASSOCIATIONS
// ============================================================================

// List calendars for an appointment type
export const listCalendars = authed
  .route({
    method: "GET",
    path: "/appointment-types/{appointmentTypeId}/calendars",
  })
  .input(z.object({ appointmentTypeId: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    return appointmentTypeService.listCalendars(input.appointmentTypeId, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Add calendar to appointment type
export const addCalendar = authed
  .route({
    method: "POST",
    path: "/appointment-types/{appointmentTypeId}/calendars",
    successStatus: 201,
  })
  .input(
    z.object({
      appointmentTypeId: z.string().uuid(),
      data: createAppointmentTypeCalendarSchema,
    }),
  )
  .handler(async ({ input, context }) => {
    return appointmentTypeService.linkCalendar(
      input.appointmentTypeId,
      { calendarId: input.data.calendarId },
      {
        orgId: context.orgId,
        userId: context.userId,
      },
    );
  });

// Remove calendar from appointment type
export const removeCalendar = authed
  .route({
    method: "DELETE",
    path: "/appointment-types/{appointmentTypeId}/calendars/{calendarId}",
  })
  .input(
    z.object({
      appointmentTypeId: z.string().uuid(),
      calendarId: z.string().uuid(),
    }),
  )
  .handler(async ({ input, context }) => {
    return appointmentTypeService.unlinkCalendar(
      input.appointmentTypeId,
      { calendarId: input.calendarId },
      {
        orgId: context.orgId,
        userId: context.userId,
      },
    );
  });

// ============================================================================
// RESOURCE ASSOCIATIONS
// ============================================================================

// List resources for an appointment type
export const listResources = authed
  .route({
    method: "GET",
    path: "/appointment-types/{appointmentTypeId}/resources",
  })
  .input(z.object({ appointmentTypeId: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    return appointmentTypeService.listResources(input.appointmentTypeId, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Add resource to appointment type
export const addResource = authed
  .route({
    method: "POST",
    path: "/appointment-types/{appointmentTypeId}/resources",
    successStatus: 201,
  })
  .input(
    z.object({
      appointmentTypeId: z.string().uuid(),
      data: createAppointmentTypeResourceSchema,
    }),
  )
  .handler(async ({ input, context }) => {
    return appointmentTypeService.linkResource(
      input.appointmentTypeId,
      {
        resourceId: input.data.resourceId,
        quantityRequired: input.data.quantityRequired,
      },
      {
        orgId: context.orgId,
        userId: context.userId,
      },
    );
  });

// Update resource association (quantity)
export const updateResource = authed
  .route({
    method: "PATCH",
    path: "/appointment-types/{appointmentTypeId}/resources/{resourceId}",
  })
  .input(
    z.object({
      appointmentTypeId: z.string().uuid(),
      resourceId: z.string().uuid(),
      data: updateAppointmentTypeResourceSchema.refine(
        (data) => data.quantityRequired !== undefined,
        { message: "quantityRequired is required for update" },
      ),
    }),
  )
  .handler(async ({ input, context }) => {
    return appointmentTypeService.updateResource(
      input.appointmentTypeId,
      {
        resourceId: input.resourceId,
        quantityRequired: input.data.quantityRequired!,
      },
      {
        orgId: context.orgId,
        userId: context.userId,
      },
    );
  });

// Remove resource from appointment type
export const removeResource = authed
  .route({
    method: "DELETE",
    path: "/appointment-types/{appointmentTypeId}/resources/{resourceId}",
  })
  .input(
    z.object({
      appointmentTypeId: z.string().uuid(),
      resourceId: z.string().uuid(),
    }),
  )
  .handler(async ({ input, context }) => {
    return appointmentTypeService.unlinkResource(
      input.appointmentTypeId,
      { resourceId: input.resourceId },
      {
        orgId: context.orgId,
        userId: context.userId,
      },
    );
  });

// Export as route object
export const appointmentTypeRoutes = {
  list,
  get,
  create,
  update,
  remove,
  // Calendar associations
  calendars: {
    list: listCalendars,
    add: addCalendar,
    remove: removeCalendar,
  },
  // Resource associations
  resources: {
    list: listResources,
    add: addResource,
    update: updateResource,
    remove: removeResource,
  },
};
