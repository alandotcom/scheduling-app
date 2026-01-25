// oRPC routes for calendars CRUD

import { z } from "zod";
import { eq, gt, and } from "drizzle-orm";
import { calendars, locations } from "@scheduling/db/schema";
import {
  createCalendarSchema,
  updateCalendarSchema,
  listCalendarsQuerySchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { withRls } from "../lib/db.js";
import { requireOrgId } from "../lib/request-context.js";
import { ApplicationError } from "../errors/application-error.js";
import { events } from "../services/jobs/emitter.js";

// List calendars with cursor pagination and optional location filter
export const list = authed
  .input(listCalendarsQuerySchema)
  .handler(async ({ input }) => {
    const { cursor, limit, locationId } = input;

    const results = await withRls(async (tx) => {
      let conditions = cursor ? gt(calendars.id, cursor) : undefined;

      if (locationId) {
        conditions = conditions
          ? and(conditions, eq(calendars.locationId, locationId))
          : eq(calendars.locationId, locationId);
      }

      return tx
        .select()
        .from(calendars)
        .where(conditions)
        .limit(limit + 1)
        .orderBy(calendars.id);
    });

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  });

// Get single calendar by ID
export const get = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input }) => {
    const { id } = input;

    const [calendar] = await withRls(async (tx) => {
      return tx.select().from(calendars).where(eq(calendars.id, id)).limit(1);
    });

    if (!calendar) {
      throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
    }

    return calendar;
  });

// Create calendar
export const create = authed
  .input(createCalendarSchema)
  .handler(async ({ input }) => {
    const orgId = requireOrgId();

    // Validate location if provided
    if (input.locationId) {
      const [location] = await withRls(async (tx) => {
        return tx
          .select()
          .from(locations)
          .where(eq(locations.id, input.locationId!))
          .limit(1);
      });

      if (!location) {
        throw new ApplicationError("Location not found", { code: "NOT_FOUND" });
      }
    }

    const [calendar] = await withRls(async (tx) => {
      return tx
        .insert(calendars)
        .values({
          orgId,
          locationId: input.locationId ?? null,
          name: input.name,
          timezone: input.timezone,
        })
        .returning();
    });

    // Emit calendar created event
    await events.calendarCreated(orgId, {
      calendarId: calendar!.id,
      name: calendar!.name,
      timezone: calendar!.timezone,
      locationId: calendar!.locationId,
    });

    return calendar;
  });

// Update calendar
export const update = authed
  .input(
    z.object({
      id: z.string().uuid(),
      data: updateCalendarSchema,
    }),
  )
  .handler(async ({ input }) => {
    const { id, data } = input;
    const orgId = requireOrgId();

    // Verify calendar exists and belongs to org
    const [existing] = await withRls(async (tx) => {
      return tx.select().from(calendars).where(eq(calendars.id, id)).limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
    }

    // Validate location if being updated
    if (data.locationId !== undefined && data.locationId !== null) {
      const [location] = await withRls(async (tx) => {
        return tx
          .select()
          .from(locations)
          .where(eq(locations.id, data.locationId!))
          .limit(1);
      });

      if (!location) {
        throw new ApplicationError("Location not found", { code: "NOT_FOUND" });
      }
    }

    const [updated] = await withRls(async (tx) => {
      return tx
        .update(calendars)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(calendars.id, id))
        .returning();
    });

    // Emit calendar updated event
    await events.calendarUpdated(orgId, {
      calendarId: updated!.id,
      changes: data,
      previous: {
        name: existing.name,
        timezone: existing.timezone,
        locationId: existing.locationId,
      },
    });

    return updated;
  });

// Delete calendar
export const remove = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input }) => {
    const { id } = input;
    const orgId = requireOrgId();

    // Verify calendar exists and belongs to org
    const [existing] = await withRls(async (tx) => {
      return tx.select().from(calendars).where(eq(calendars.id, id)).limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
    }

    await withRls(async (tx) => {
      return tx.delete(calendars).where(eq(calendars.id, id));
    });

    // Emit calendar deleted event
    await events.calendarDeleted(orgId, {
      calendarId: id,
      name: existing.name,
      timezone: existing.timezone,
      locationId: existing.locationId,
    });

    return { success: true };
  });

// Export as route object
export const calendarRoutes = {
  list,
  get,
  create,
  update,
  remove,
};
