// oRPC routes for appointment types CRUD with join table routes

import { z } from "zod";
import { eq, gt, and } from "drizzle-orm";
import {
  appointmentTypes,
  appointmentTypeCalendars,
  appointmentTypeResources,
  calendars,
  resources,
} from "@scheduling/db/schema";
import {
  createAppointmentTypeSchema,
  updateAppointmentTypeSchema,
  listAppointmentTypesQuerySchema,
  createAppointmentTypeCalendarSchema,
  createAppointmentTypeResourceSchema,
  updateAppointmentTypeResourceSchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { withRls } from "../lib/db.js";
import { requireOrgId } from "../lib/request-context.js";
import { ApplicationError } from "../errors/application-error.js";
import { events } from "../services/jobs/emitter.js";

// List appointment types with cursor pagination
export const list = authed
  .input(listAppointmentTypesQuerySchema)
  .handler(async ({ input }) => {
    const { cursor, limit } = input;

    const results = await withRls(async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(cursor ? gt(appointmentTypes.id, cursor) : undefined)
        .limit(limit + 1)
        .orderBy(appointmentTypes.id);
    });

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  });

// Get single appointment type by ID
export const get = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input }) => {
    const { id } = input;

    const [appointmentType] = await withRls(async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, id))
        .limit(1);
    });

    if (!appointmentType) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    return appointmentType;
  });

// Create appointment type
export const create = authed
  .input(createAppointmentTypeSchema)
  .handler(async ({ input }) => {
    const orgId = requireOrgId();

    const [appointmentType] = await withRls(async (tx) => {
      return tx
        .insert(appointmentTypes)
        .values({
          orgId,
          name: input.name,
          durationMin: input.durationMin,
          paddingBeforeMin: input.paddingBeforeMin ?? null,
          paddingAfterMin: input.paddingAfterMin ?? null,
          capacity: input.capacity ?? null,
          metadata: input.metadata ?? null,
        })
        .returning();
    });

    // Emit appointment type created event
    await events.appointmentTypeCreated(orgId, {
      appointmentTypeId: appointmentType!.id,
      name: appointmentType!.name,
      durationMin: appointmentType!.durationMin,
      paddingBeforeMin: appointmentType!.paddingBeforeMin,
      paddingAfterMin: appointmentType!.paddingAfterMin,
      capacity: appointmentType!.capacity,
    });

    return appointmentType;
  });

// Update appointment type
export const update = authed
  .input(
    z.object({
      id: z.string().uuid(),
      data: updateAppointmentTypeSchema,
    }),
  )
  .handler(async ({ input }) => {
    const { id, data } = input;
    const orgId = requireOrgId();

    // Verify appointment type exists and belongs to org
    const [existing] = await withRls(async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, id))
        .limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    const [updated] = await withRls(async (tx) => {
      return tx
        .update(appointmentTypes)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(appointmentTypes.id, id))
        .returning();
    });

    // Emit appointment type updated event
    await events.appointmentTypeUpdated(orgId, {
      appointmentTypeId: updated!.id,
      changes: data,
      previous: {
        name: existing.name,
        durationMin: existing.durationMin,
        paddingBeforeMin: existing.paddingBeforeMin,
        paddingAfterMin: existing.paddingAfterMin,
        capacity: existing.capacity,
      },
    });

    return updated;
  });

// Delete appointment type
export const remove = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input }) => {
    const { id } = input;
    const orgId = requireOrgId();

    // Verify appointment type exists and belongs to org
    const [existing] = await withRls(async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, id))
        .limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    await withRls(async (tx) => {
      // Delete associated calendars and resources first
      await tx
        .delete(appointmentTypeCalendars)
        .where(eq(appointmentTypeCalendars.appointmentTypeId, id));
      await tx
        .delete(appointmentTypeResources)
        .where(eq(appointmentTypeResources.appointmentTypeId, id));
      return tx.delete(appointmentTypes).where(eq(appointmentTypes.id, id));
    });

    // Emit appointment type deleted event
    await events.appointmentTypeDeleted(orgId, {
      appointmentTypeId: id,
      name: existing.name,
      durationMin: existing.durationMin,
    });

    return { success: true };
  });

// ============================================================================
// CALENDAR ASSOCIATIONS
// ============================================================================

// List calendars for an appointment type
export const listCalendars = authed
  .input(z.object({ appointmentTypeId: z.string().uuid() }))
  .handler(async ({ input }) => {
    const { appointmentTypeId } = input;

    // Verify appointment type exists
    const [appointmentType] = await withRls(async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, appointmentTypeId))
        .limit(1);
    });

    if (!appointmentType) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    const results = await withRls(async (tx) => {
      return tx
        .select({
          id: appointmentTypeCalendars.id,
          appointmentTypeId: appointmentTypeCalendars.appointmentTypeId,
          calendarId: appointmentTypeCalendars.calendarId,
          calendar: calendars,
        })
        .from(appointmentTypeCalendars)
        .innerJoin(
          calendars,
          eq(appointmentTypeCalendars.calendarId, calendars.id),
        )
        .where(
          eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId),
        );
    });

    return results;
  });

// Add calendar to appointment type
export const addCalendar = authed
  .input(
    z.object({
      appointmentTypeId: z.string().uuid(),
      data: createAppointmentTypeCalendarSchema,
    }),
  )
  .handler(async ({ input }) => {
    const { appointmentTypeId, data } = input;

    // Verify appointment type exists
    const [appointmentType] = await withRls(async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, appointmentTypeId))
        .limit(1);
    });

    if (!appointmentType) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    // Verify calendar exists
    const [calendar] = await withRls(async (tx) => {
      return tx
        .select()
        .from(calendars)
        .where(eq(calendars.id, data.calendarId))
        .limit(1);
    });

    if (!calendar) {
      throw new ApplicationError("Calendar not found", { code: "NOT_FOUND" });
    }

    // Check for existing association
    const [existing] = await withRls(async (tx) => {
      return tx
        .select()
        .from(appointmentTypeCalendars)
        .where(
          and(
            eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeCalendars.calendarId, data.calendarId),
          ),
        )
        .limit(1);
    });

    if (existing) {
      throw new ApplicationError(
        "Calendar already associated with appointment type",
        {
          code: "CONFLICT",
        },
      );
    }

    const [association] = await withRls(async (tx) => {
      return tx
        .insert(appointmentTypeCalendars)
        .values({
          appointmentTypeId,
          calendarId: data.calendarId,
        })
        .returning();
    });

    return association;
  });

// Remove calendar from appointment type
export const removeCalendar = authed
  .input(
    z.object({
      appointmentTypeId: z.string().uuid(),
      calendarId: z.string().uuid(),
    }),
  )
  .handler(async ({ input }) => {
    const { appointmentTypeId, calendarId } = input;

    // Verify association exists
    const [existing] = await withRls(async (tx) => {
      return tx
        .select()
        .from(appointmentTypeCalendars)
        .where(
          and(
            eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeCalendars.calendarId, calendarId),
          ),
        )
        .limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Association not found", {
        code: "NOT_FOUND",
      });
    }

    await withRls(async (tx) => {
      return tx
        .delete(appointmentTypeCalendars)
        .where(
          and(
            eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeCalendars.calendarId, calendarId),
          ),
        );
    });

    return { success: true };
  });

// ============================================================================
// RESOURCE ASSOCIATIONS
// ============================================================================

// List resources for an appointment type
export const listResources = authed
  .input(z.object({ appointmentTypeId: z.string().uuid() }))
  .handler(async ({ input }) => {
    const { appointmentTypeId } = input;

    // Verify appointment type exists
    const [appointmentType] = await withRls(async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, appointmentTypeId))
        .limit(1);
    });

    if (!appointmentType) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    const results = await withRls(async (tx) => {
      return tx
        .select({
          id: appointmentTypeResources.id,
          appointmentTypeId: appointmentTypeResources.appointmentTypeId,
          resourceId: appointmentTypeResources.resourceId,
          quantityRequired: appointmentTypeResources.quantityRequired,
          resource: resources,
        })
        .from(appointmentTypeResources)
        .innerJoin(
          resources,
          eq(appointmentTypeResources.resourceId, resources.id),
        )
        .where(
          eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId),
        );
    });

    return results;
  });

// Add resource to appointment type
export const addResource = authed
  .input(
    z.object({
      appointmentTypeId: z.string().uuid(),
      data: createAppointmentTypeResourceSchema,
    }),
  )
  .handler(async ({ input }) => {
    const { appointmentTypeId, data } = input;

    // Verify appointment type exists
    const [appointmentType] = await withRls(async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, appointmentTypeId))
        .limit(1);
    });

    if (!appointmentType) {
      throw new ApplicationError("Appointment type not found", {
        code: "NOT_FOUND",
      });
    }

    // Verify resource exists
    const [resource] = await withRls(async (tx) => {
      return tx
        .select()
        .from(resources)
        .where(eq(resources.id, data.resourceId))
        .limit(1);
    });

    if (!resource) {
      throw new ApplicationError("Resource not found", { code: "NOT_FOUND" });
    }

    // Check for existing association
    const [existing] = await withRls(async (tx) => {
      return tx
        .select()
        .from(appointmentTypeResources)
        .where(
          and(
            eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeResources.resourceId, data.resourceId),
          ),
        )
        .limit(1);
    });

    if (existing) {
      throw new ApplicationError(
        "Resource already associated with appointment type",
        {
          code: "CONFLICT",
        },
      );
    }

    const [association] = await withRls(async (tx) => {
      return tx
        .insert(appointmentTypeResources)
        .values({
          appointmentTypeId,
          resourceId: data.resourceId,
          quantityRequired: data.quantityRequired,
        })
        .returning();
    });

    return association;
  });

// Update resource association (quantity)
export const updateResource = authed
  .input(
    z.object({
      appointmentTypeId: z.string().uuid(),
      resourceId: z.string().uuid(),
      data: updateAppointmentTypeResourceSchema,
    }),
  )
  .handler(async ({ input }) => {
    const { appointmentTypeId, resourceId, data } = input;

    // Verify association exists
    const [existing] = await withRls(async (tx) => {
      return tx
        .select()
        .from(appointmentTypeResources)
        .where(
          and(
            eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeResources.resourceId, resourceId),
          ),
        )
        .limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Association not found", {
        code: "NOT_FOUND",
      });
    }

    const [updated] = await withRls(async (tx) => {
      return tx
        .update(appointmentTypeResources)
        .set(data)
        .where(
          and(
            eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeResources.resourceId, resourceId),
          ),
        )
        .returning();
    });

    return updated;
  });

// Remove resource from appointment type
export const removeResource = authed
  .input(
    z.object({
      appointmentTypeId: z.string().uuid(),
      resourceId: z.string().uuid(),
    }),
  )
  .handler(async ({ input }) => {
    const { appointmentTypeId, resourceId } = input;

    // Verify association exists
    const [existing] = await withRls(async (tx) => {
      return tx
        .select()
        .from(appointmentTypeResources)
        .where(
          and(
            eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeResources.resourceId, resourceId),
          ),
        )
        .limit(1);
    });

    if (!existing) {
      throw new ApplicationError("Association not found", {
        code: "NOT_FOUND",
      });
    }

    await withRls(async (tx) => {
      return tx
        .delete(appointmentTypeResources)
        .where(
          and(
            eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeResources.resourceId, resourceId),
          ),
        );
    });

    return { success: true };
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
