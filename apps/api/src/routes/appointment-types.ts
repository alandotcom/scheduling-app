// oRPC routes for appointment types CRUD with calendar/resource associations

import { z } from "zod";
import {
  createAppointmentTypeSchema,
  updateAppointmentTypeSchema,
  listAppointmentTypesQuerySchema,
  createAppointmentTypeCalendarSchema,
  createAppointmentTypeResourceSchema,
  updateAppointmentTypeResourceSchema,
  appointmentTypeResponseSchema,
  appointmentTypeWithLinksSchema,
  appointmentTypeListResponseSchema,
  appointmentTypeCalendarSchema,
  appointmentTypeCalendarAssociationSchema,
  appointmentTypeResourceSchema,
  appointmentTypeResourceAssociationSchema,
  successResponseSchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { appointmentTypeService } from "../services/appointment-types.js";

// List appointment types with cursor pagination
export const list = authed
  .route({
    method: "GET",
    path: "/appointment-types",
    tags: ["Appointment Types"],
    summary: "List appointment types",
    description: "Returns appointment types for the active organization.",
  })
  .input(listAppointmentTypesQuerySchema)
  .output(appointmentTypeListResponseSchema)
  .handler(async ({ input, context }) => {
    const result = await appointmentTypeService.list(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
    return appointmentTypeListResponseSchema.parse(result);
  });

// Get single appointment type by ID (with linked calendars/resources)
export const get = authed
  .route({
    method: "GET",
    path: "/appointment-types/{id}",
    tags: ["Appointment Types"],
    summary: "Get appointment type",
    description:
      "Returns a single appointment type, including linked calendars and resources.",
  })
  .input(z.object({ id: z.uuid() }))
  .output(appointmentTypeWithLinksSchema)
  .handler(async ({ input, context }) => {
    const result = await appointmentTypeService.get(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
    return appointmentTypeWithLinksSchema.parse(result);
  });

// Create appointment type
export const create = authed
  .route({
    method: "POST",
    path: "/appointment-types",
    successStatus: 201,
    tags: ["Appointment Types"],
    summary: "Create appointment type",
    description: "Creates a new appointment type in the active organization.",
  })
  .input(createAppointmentTypeSchema)
  .output(appointmentTypeResponseSchema)
  .handler(async ({ input, context }) => {
    const result = await appointmentTypeService.create(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
    return appointmentTypeResponseSchema.parse(result);
  });

// Update appointment type
export const update = authed
  .route({
    method: "PATCH",
    path: "/appointment-types/{id}",
    tags: ["Appointment Types"],
    summary: "Update appointment type",
    description: "Updates an existing appointment type.",
  })
  .input(
    updateAppointmentTypeSchema.extend({
      id: z.uuid(),
    }),
  )
  .output(appointmentTypeResponseSchema)
  .handler(async ({ input, context }) => {
    const { id, ...data } = input;
    const result = await appointmentTypeService.update(id, data, {
      orgId: context.orgId,
      userId: context.userId,
    });
    return appointmentTypeResponseSchema.parse(result);
  });

// Delete appointment type
export const remove = authed
  .route({
    method: "DELETE",
    path: "/appointment-types/{id}",
    tags: ["Appointment Types"],
    summary: "Delete appointment type",
    description: "Deletes an appointment type.",
  })
  .input(z.object({ id: z.uuid() }))
  .output(successResponseSchema)
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
    tags: ["Appointment Types"],
    summary: "List linked calendars",
    description: "Lists calendars currently linked to an appointment type.",
  })
  .input(z.object({ appointmentTypeId: z.uuid() }))
  .output(z.array(appointmentTypeCalendarAssociationSchema))
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
    tags: ["Appointment Types"],
    summary: "Link calendar to appointment type",
    description:
      "Links an existing calendar to an appointment type. This does not create a calendar.",
  })
  .input(
    createAppointmentTypeCalendarSchema.extend({
      appointmentTypeId: z.uuid(),
    }),
  )
  .output(appointmentTypeCalendarSchema)
  .handler(async ({ input, context }) => {
    return appointmentTypeService.linkCalendar(
      input.appointmentTypeId,
      { calendarId: input.calendarId },
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
    tags: ["Appointment Types"],
    summary: "Unlink calendar from appointment type",
    description: "Removes an existing calendar link from an appointment type.",
  })
  .input(
    z.object({
      appointmentTypeId: z.uuid(),
      calendarId: z.uuid(),
    }),
  )
  .output(successResponseSchema)
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
    tags: ["Appointment Types"],
    summary: "List linked resources",
    description: "Lists resources currently linked to an appointment type.",
  })
  .input(z.object({ appointmentTypeId: z.uuid() }))
  .output(z.array(appointmentTypeResourceAssociationSchema))
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
    tags: ["Appointment Types"],
    summary: "Link resource to appointment type",
    description:
      "Links an existing resource to an appointment type. This does not create a resource.",
  })
  .input(
    createAppointmentTypeResourceSchema.extend({
      appointmentTypeId: z.uuid(),
    }),
  )
  .output(appointmentTypeResourceSchema)
  .handler(async ({ input, context }) => {
    return appointmentTypeService.linkResource(
      input.appointmentTypeId,
      {
        resourceId: input.resourceId,
        quantityRequired: input.quantityRequired,
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
    tags: ["Appointment Types"],
    summary: "Update linked resource",
    description: "Updates an existing resource link for an appointment type.",
  })
  .input(
    updateAppointmentTypeResourceSchema
      .refine((data) => data.quantityRequired !== undefined, {
        message: "quantityRequired is required for update",
      })
      .extend({
        appointmentTypeId: z.uuid(),
        resourceId: z.uuid(),
      }),
  )
  .output(appointmentTypeResourceSchema)
  .handler(async ({ input, context }) => {
    return appointmentTypeService.updateResource(
      input.appointmentTypeId,
      {
        resourceId: input.resourceId,
        quantityRequired: input.quantityRequired!,
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
    tags: ["Appointment Types"],
    summary: "Unlink resource from appointment type",
    description: "Removes an existing resource link from an appointment type.",
  })
  .input(
    z.object({
      appointmentTypeId: z.uuid(),
      resourceId: z.uuid(),
    }),
  )
  .output(successResponseSchema)
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
    link: addCalendar,
    unlink: removeCalendar,
  },
  // Resource associations
  resources: {
    list: listResources,
    link: addResource,
    update: updateResource,
    unlink: removeResource,
  },
};
