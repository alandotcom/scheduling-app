// oRPC routes for calendars CRUD

import { z } from "zod";
import {
  createCalendarSchema,
  updateCalendarSchema,
  listCalendarsQuerySchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { calendarService } from "../services/calendars.js";

// List calendars with cursor pagination and optional location filter
export const list = authed
  .input(listCalendarsQuerySchema)
  .handler(async ({ input, context }) => {
    return calendarService.list(input, {
      orgId: context.orgId,
      userId: context.userId!,
    });
  });

// Get single calendar by ID
export const get = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    return calendarService.get(input.id, {
      orgId: context.orgId,
      userId: context.userId!,
    });
  });

// Create calendar
export const create = authed
  .input(createCalendarSchema)
  .handler(async ({ input, context }) => {
    return calendarService.create(input, {
      orgId: context.orgId,
      userId: context.userId!,
    });
  });

// Update calendar
export const update = authed
  .input(
    z.object({
      id: z.string().uuid(),
      data: updateCalendarSchema,
    }),
  )
  .handler(async ({ input, context }) => {
    return calendarService.update(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId!,
    });
  });

// Delete calendar
export const remove = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    return calendarService.delete(input.id, {
      orgId: context.orgId,
      userId: context.userId!,
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
