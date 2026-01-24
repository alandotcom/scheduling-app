// oRPC routes for calendars CRUD

import { z } from 'zod'
import { eq, gt, and } from 'drizzle-orm'
import { calendars, locations } from '@scheduling/db/schema'
import {
  createCalendarSchema,
  updateCalendarSchema,
  listCalendarsQuerySchema,
} from '@scheduling/dto'
import { authed } from './base.js'
import { withOrg } from '../lib/db.js'
import { ORPCError } from '../lib/orpc.js'

// List calendars with cursor pagination and optional location filter
export const list = authed
  .input(listCalendarsQuerySchema)
  .handler(async ({ input, context }) => {
    const { cursor, limit, locationId } = input
    const { orgId } = context

    const results = await withOrg(orgId, async (tx) => {
      let conditions = cursor ? gt(calendars.id, cursor) : undefined

      if (locationId) {
        conditions = conditions
          ? and(conditions, eq(calendars.locationId, locationId))
          : eq(calendars.locationId, locationId)
      }

      return tx
        .select()
        .from(calendars)
        .where(conditions)
        .limit(limit + 1)
        .orderBy(calendars.id)
    })

    const hasMore = results.length > limit
    const items = hasMore ? results.slice(0, limit) : results

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    }
  })

// Get single calendar by ID
export const get = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const { id } = input
    const { orgId } = context

    const [calendar] = await withOrg(orgId, async (tx) => {
      return tx.select().from(calendars).where(eq(calendars.id, id)).limit(1)
    })

    if (!calendar) {
      throw new ORPCError('NOT_FOUND', { message: 'Calendar not found' })
    }

    return calendar
  })

// Create calendar
export const create = authed
  .input(createCalendarSchema)
  .handler(async ({ input, context }) => {
    const { orgId } = context

    // Validate location if provided
    if (input.locationId) {
      const [location] = await withOrg(orgId, async (tx) => {
        return tx
          .select()
          .from(locations)
          .where(eq(locations.id, input.locationId!))
          .limit(1)
      })

      if (!location) {
        throw new ORPCError('NOT_FOUND', { message: 'Location not found' })
      }
    }

    const [calendar] = await withOrg(orgId, async (tx) => {
      return tx
        .insert(calendars)
        .values({
          orgId,
          locationId: input.locationId ?? null,
          name: input.name,
          timezone: input.timezone,
        })
        .returning()
    })

    return calendar
  })

// Update calendar
export const update = authed
  .input(
    z.object({
      id: z.string().uuid(),
      data: updateCalendarSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const { id, data } = input
    const { orgId } = context

    // Verify calendar exists and belongs to org
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx.select().from(calendars).where(eq(calendars.id, id)).limit(1)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Calendar not found' })
    }

    // Validate location if being updated
    if (data.locationId !== undefined && data.locationId !== null) {
      const [location] = await withOrg(orgId, async (tx) => {
        return tx
          .select()
          .from(locations)
          .where(eq(locations.id, data.locationId!))
          .limit(1)
      })

      if (!location) {
        throw new ORPCError('NOT_FOUND', { message: 'Location not found' })
      }
    }

    const [updated] = await withOrg(orgId, async (tx) => {
      return tx
        .update(calendars)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(calendars.id, id))
        .returning()
    })

    return updated
  })

// Delete calendar
export const remove = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const { id } = input
    const { orgId } = context

    // Verify calendar exists and belongs to org
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx.select().from(calendars).where(eq(calendars.id, id)).limit(1)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Calendar not found' })
    }

    await withOrg(orgId, async (tx) => {
      return tx.delete(calendars).where(eq(calendars.id, id))
    })

    return { success: true }
  })

// Export as route object
export const calendarRoutes = {
  list,
  get,
  create,
  update,
  remove,
}
