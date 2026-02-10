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
  .route({ method: "GET", path: "/calendars" })
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
  .route({ method: "GET", path: "/calendars/{id}" })
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
  .route({ method: "POST", path: "/calendars", successStatus: 201 })
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
  .route({ method: "PATCH", path: "/calendars/{id}" })
  .input(
    z.object({
      id: z.uuid(),
      data: updateCalendarSchema,
    }),
  )
  .output(calendarResponseSchema)
  .handler(async ({ input, context }) => {
    return calendarService.update(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Delete calendar
export const remove = authed
  .route({ method: "DELETE", path: "/calendars/{id}" })
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
