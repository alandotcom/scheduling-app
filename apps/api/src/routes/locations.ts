// oRPC routes for locations CRUD

import { z } from 'zod'
import { eq, gt } from 'drizzle-orm'
import { locations } from '@scheduling/db/schema'
import {
  createLocationSchema,
  updateLocationSchema,
  listLocationsQuerySchema,
} from '@scheduling/dto'
import { authed } from './base.js'
import { withOrg } from '../lib/db.js'
import { ORPCError } from '../lib/orpc.js'

// List locations with cursor pagination
export const list = authed
  .input(listLocationsQuerySchema)
  .handler(async ({ input, context }) => {
    const { cursor, limit } = input
    const { orgId } = context

    const results = await withOrg(orgId, async (tx) => {
      const query = tx
        .select()
        .from(locations)
        .where(cursor ? gt(locations.id, cursor) : undefined)
        .limit(limit + 1)
        .orderBy(locations.id)

      return query
    })

    const hasMore = results.length > limit
    const items = hasMore ? results.slice(0, limit) : results

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    }
  })

// Get single location by ID
export const get = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const { id } = input
    const { orgId } = context

    const [location] = await withOrg(orgId, async (tx) => {
      return tx.select().from(locations).where(eq(locations.id, id)).limit(1)
    })

    if (!location) {
      throw new ORPCError('NOT_FOUND', { message: 'Location not found' })
    }

    return location
  })

// Create location
export const create = authed
  .input(createLocationSchema)
  .handler(async ({ input, context }) => {
    const { orgId } = context

    const [location] = await withOrg(orgId, async (tx) => {
      return tx
        .insert(locations)
        .values({
          orgId,
          name: input.name,
          timezone: input.timezone,
        })
        .returning()
    })

    return location
  })

// Update location
export const update = authed
  .input(
    z.object({
      id: z.string().uuid(),
      data: updateLocationSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const { id, data } = input
    const { orgId } = context

    // Verify location exists and belongs to org
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx.select().from(locations).where(eq(locations.id, id)).limit(1)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Location not found' })
    }

    const [updated] = await withOrg(orgId, async (tx) => {
      return tx
        .update(locations)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(locations.id, id))
        .returning()
    })

    return updated
  })

// Delete location
export const remove = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const { id } = input
    const { orgId } = context

    // Verify location exists and belongs to org
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx.select().from(locations).where(eq(locations.id, id)).limit(1)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Location not found' })
    }

    await withOrg(orgId, async (tx) => {
      return tx.delete(locations).where(eq(locations.id, id))
    })

    return { success: true }
  })

// Export as route object
export const locationRoutes = {
  list,
  get,
  create,
  update,
  remove,
}
