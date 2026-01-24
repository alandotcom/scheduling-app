// oRPC routes for appointment types CRUD with join table routes

import { z } from 'zod'
import { eq, gt, and } from 'drizzle-orm'
import {
  appointmentTypes,
  appointmentTypeCalendars,
  appointmentTypeResources,
  calendars,
  resources,
} from '@scheduling/db/schema'
import {
  createAppointmentTypeSchema,
  updateAppointmentTypeSchema,
  listAppointmentTypesQuerySchema,
  createAppointmentTypeCalendarSchema,
  createAppointmentTypeResourceSchema,
  updateAppointmentTypeResourceSchema,
} from '@scheduling/dto'
import { authed } from './base.js'
import { withOrg } from '../lib/db.js'
import { ORPCError } from '../lib/orpc.js'

// List appointment types with cursor pagination
export const list = authed
  .input(listAppointmentTypesQuerySchema)
  .handler(async ({ input, context }) => {
    const { cursor, limit } = input
    const { orgId } = context

    const results = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(cursor ? gt(appointmentTypes.id, cursor) : undefined)
        .limit(limit + 1)
        .orderBy(appointmentTypes.id)
    })

    const hasMore = results.length > limit
    const items = hasMore ? results.slice(0, limit) : results

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    }
  })

// Get single appointment type by ID
export const get = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const { id } = input
    const { orgId } = context

    const [appointmentType] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, id))
        .limit(1)
    })

    if (!appointmentType) {
      throw new ORPCError('NOT_FOUND', { message: 'Appointment type not found' })
    }

    return appointmentType
  })

// Create appointment type
export const create = authed
  .input(createAppointmentTypeSchema)
  .handler(async ({ input, context }) => {
    const { orgId } = context

    const [appointmentType] = await withOrg(orgId, async (tx) => {
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
        .returning()
    })

    return appointmentType
  })

// Update appointment type
export const update = authed
  .input(
    z.object({
      id: z.string().uuid(),
      data: updateAppointmentTypeSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const { id, data } = input
    const { orgId } = context

    // Verify appointment type exists and belongs to org
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, id))
        .limit(1)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Appointment type not found' })
    }

    const [updated] = await withOrg(orgId, async (tx) => {
      return tx
        .update(appointmentTypes)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(appointmentTypes.id, id))
        .returning()
    })

    return updated
  })

// Delete appointment type
export const remove = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const { id } = input
    const { orgId } = context

    // Verify appointment type exists and belongs to org
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, id))
        .limit(1)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Appointment type not found' })
    }

    await withOrg(orgId, async (tx) => {
      // Delete associated calendars and resources first
      await tx
        .delete(appointmentTypeCalendars)
        .where(eq(appointmentTypeCalendars.appointmentTypeId, id))
      await tx
        .delete(appointmentTypeResources)
        .where(eq(appointmentTypeResources.appointmentTypeId, id))
      return tx.delete(appointmentTypes).where(eq(appointmentTypes.id, id))
    })

    return { success: true }
  })

// ============================================================================
// CALENDAR ASSOCIATIONS
// ============================================================================

// List calendars for an appointment type
export const listCalendars = authed
  .input(z.object({ appointmentTypeId: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const { appointmentTypeId } = input
    const { orgId } = context

    // Verify appointment type exists
    const [appointmentType] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, appointmentTypeId))
        .limit(1)
    })

    if (!appointmentType) {
      throw new ORPCError('NOT_FOUND', { message: 'Appointment type not found' })
    }

    const results = await withOrg(orgId, async (tx) => {
      return tx
        .select({
          id: appointmentTypeCalendars.id,
          appointmentTypeId: appointmentTypeCalendars.appointmentTypeId,
          calendarId: appointmentTypeCalendars.calendarId,
          calendar: calendars,
        })
        .from(appointmentTypeCalendars)
        .innerJoin(calendars, eq(appointmentTypeCalendars.calendarId, calendars.id))
        .where(eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId))
    })

    return results
  })

// Add calendar to appointment type
export const addCalendar = authed
  .input(
    z.object({
      appointmentTypeId: z.string().uuid(),
      data: createAppointmentTypeCalendarSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const { appointmentTypeId, data } = input
    const { orgId } = context

    // Verify appointment type exists
    const [appointmentType] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, appointmentTypeId))
        .limit(1)
    })

    if (!appointmentType) {
      throw new ORPCError('NOT_FOUND', { message: 'Appointment type not found' })
    }

    // Verify calendar exists
    const [calendar] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(calendars)
        .where(eq(calendars.id, data.calendarId))
        .limit(1)
    })

    if (!calendar) {
      throw new ORPCError('NOT_FOUND', { message: 'Calendar not found' })
    }

    // Check for existing association
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(appointmentTypeCalendars)
        .where(
          and(
            eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeCalendars.calendarId, data.calendarId)
          )
        )
        .limit(1)
    })

    if (existing) {
      throw new ORPCError('CONFLICT', {
        message: 'Calendar already associated with appointment type',
      })
    }

    const [association] = await withOrg(orgId, async (tx) => {
      return tx
        .insert(appointmentTypeCalendars)
        .values({
          appointmentTypeId,
          calendarId: data.calendarId,
        })
        .returning()
    })

    return association
  })

// Remove calendar from appointment type
export const removeCalendar = authed
  .input(
    z.object({
      appointmentTypeId: z.string().uuid(),
      calendarId: z.string().uuid(),
    })
  )
  .handler(async ({ input, context }) => {
    const { appointmentTypeId, calendarId } = input
    const { orgId } = context

    // Verify association exists
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(appointmentTypeCalendars)
        .where(
          and(
            eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeCalendars.calendarId, calendarId)
          )
        )
        .limit(1)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Association not found' })
    }

    await withOrg(orgId, async (tx) => {
      return tx
        .delete(appointmentTypeCalendars)
        .where(
          and(
            eq(appointmentTypeCalendars.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeCalendars.calendarId, calendarId)
          )
        )
    })

    return { success: true }
  })

// ============================================================================
// RESOURCE ASSOCIATIONS
// ============================================================================

// List resources for an appointment type
export const listResources = authed
  .input(z.object({ appointmentTypeId: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const { appointmentTypeId } = input
    const { orgId } = context

    // Verify appointment type exists
    const [appointmentType] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, appointmentTypeId))
        .limit(1)
    })

    if (!appointmentType) {
      throw new ORPCError('NOT_FOUND', { message: 'Appointment type not found' })
    }

    const results = await withOrg(orgId, async (tx) => {
      return tx
        .select({
          id: appointmentTypeResources.id,
          appointmentTypeId: appointmentTypeResources.appointmentTypeId,
          resourceId: appointmentTypeResources.resourceId,
          quantityRequired: appointmentTypeResources.quantityRequired,
          resource: resources,
        })
        .from(appointmentTypeResources)
        .innerJoin(resources, eq(appointmentTypeResources.resourceId, resources.id))
        .where(eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId))
    })

    return results
  })

// Add resource to appointment type
export const addResource = authed
  .input(
    z.object({
      appointmentTypeId: z.string().uuid(),
      data: createAppointmentTypeResourceSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const { appointmentTypeId, data } = input
    const { orgId } = context

    // Verify appointment type exists
    const [appointmentType] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(appointmentTypes)
        .where(eq(appointmentTypes.id, appointmentTypeId))
        .limit(1)
    })

    if (!appointmentType) {
      throw new ORPCError('NOT_FOUND', { message: 'Appointment type not found' })
    }

    // Verify resource exists
    const [resource] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(resources)
        .where(eq(resources.id, data.resourceId))
        .limit(1)
    })

    if (!resource) {
      throw new ORPCError('NOT_FOUND', { message: 'Resource not found' })
    }

    // Check for existing association
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(appointmentTypeResources)
        .where(
          and(
            eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeResources.resourceId, data.resourceId)
          )
        )
        .limit(1)
    })

    if (existing) {
      throw new ORPCError('CONFLICT', {
        message: 'Resource already associated with appointment type',
      })
    }

    const [association] = await withOrg(orgId, async (tx) => {
      return tx
        .insert(appointmentTypeResources)
        .values({
          appointmentTypeId,
          resourceId: data.resourceId,
          quantityRequired: data.quantityRequired,
        })
        .returning()
    })

    return association
  })

// Update resource association (quantity)
export const updateResource = authed
  .input(
    z.object({
      appointmentTypeId: z.string().uuid(),
      resourceId: z.string().uuid(),
      data: updateAppointmentTypeResourceSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const { appointmentTypeId, resourceId, data } = input
    const { orgId } = context

    // Verify association exists
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(appointmentTypeResources)
        .where(
          and(
            eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeResources.resourceId, resourceId)
          )
        )
        .limit(1)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Association not found' })
    }

    const [updated] = await withOrg(orgId, async (tx) => {
      return tx
        .update(appointmentTypeResources)
        .set(data)
        .where(
          and(
            eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeResources.resourceId, resourceId)
          )
        )
        .returning()
    })

    return updated
  })

// Remove resource from appointment type
export const removeResource = authed
  .input(
    z.object({
      appointmentTypeId: z.string().uuid(),
      resourceId: z.string().uuid(),
    })
  )
  .handler(async ({ input, context }) => {
    const { appointmentTypeId, resourceId } = input
    const { orgId } = context

    // Verify association exists
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx
        .select()
        .from(appointmentTypeResources)
        .where(
          and(
            eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeResources.resourceId, resourceId)
          )
        )
        .limit(1)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Association not found' })
    }

    await withOrg(orgId, async (tx) => {
      return tx
        .delete(appointmentTypeResources)
        .where(
          and(
            eq(appointmentTypeResources.appointmentTypeId, appointmentTypeId),
            eq(appointmentTypeResources.resourceId, resourceId)
          )
        )
    })

    return { success: true }
  })

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
}
