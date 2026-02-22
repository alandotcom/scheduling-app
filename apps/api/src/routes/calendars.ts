// oRPC routes for calendars CRUD

import { z } from "zod";
import {
  createCalendarSchema,
  updateCalendarSchema,
  listCalendarsQuerySchema,
  calendarResponseSchema,
  calendarWithLocationSchema,
  calendarListResponseSchema,
  successResponseSchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { calendarService } from "../services/calendars.js";

// List calendars with cursor pagination and optional location filter
export const list = authed
  .route({
    method: "GET",
    path: "/calendars",
    tags: ["Calendars"],
    summary: "List calendars",
    description: "Returns calendars for the active organization.",
  })
  .input(listCalendarsQuerySchema)
  .output(calendarListResponseSchema)
  .handler(async ({ input, context }) => {
    return calendarService.list(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Get single calendar by ID
export const get = authed
  .route({
    method: "GET",
    path: "/calendars/{id}",
    tags: ["Calendars"],
    summary: "Get calendar",
    description: "Returns one calendar by ID.",
  })
  .input(z.object({ id: z.uuid() }))
  .output(calendarWithLocationSchema)
  .handler(async ({ input, context }) => {
    return calendarService.get(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Create calendar
export const create = authed
  .route({
    method: "POST",
    path: "/calendars",
    successStatus: 201,
    tags: ["Calendars"],
    summary: "Create calendar",
    description: "Creates a new calendar.",
  })
  .input(createCalendarSchema)
  .output(calendarResponseSchema)
  .handler(async ({ input, context }) => {
    return calendarService.create(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Update calendar
export const update = authed
  .route({
    method: "PATCH",
    path: "/calendars/{id}",
    tags: ["Calendars"],
    summary: "Update calendar",
    description: "Updates an existing calendar.",
  })
  .input(
    updateCalendarSchema.extend({
      id: z.uuid(),
    }),
  )
  .output(calendarResponseSchema)
  .handler(async ({ input, context }) => {
    const { id, ...data } = input;
    return calendarService.update(id, data, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Delete calendar
export const remove = authed
  .route({
    method: "DELETE",
    path: "/calendars/{id}",
    tags: ["Calendars"],
    summary: "Delete calendar",
    description: "Deletes a calendar.",
  })
  .input(z.object({ id: z.uuid() }))
  .output(successResponseSchema)
  .handler(async ({ input, context }) => {
    return calendarService.delete(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Export as route object
export const calendarRoutes = {
  list,
  get,
  create,
  update,
  remove,
};
