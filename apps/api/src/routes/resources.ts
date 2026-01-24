// oRPC routes for resources CRUD

import { z } from 'zod'
import { eq, gt, and } from 'drizzle-orm'
import { resources, locations } from '@scheduling/db/schema'
import {
  createResourceSchema,
  updateResourceSchema,
  listResourcesQuerySchema,
} from '@scheduling/dto'
import { authed } from './base.js'
import { withOrg } from '../lib/db.js'
import { ORPCError } from '../lib/orpc.js'

// List resources with cursor pagination and optional location filter
export const list = authed
  .input(listResourcesQuerySchema)
  .handler(async ({ input, context }) => {
    const { cursor, limit, locationId } = input
    const { orgId } = context

    const results = await withOrg(orgId, async (tx) => {
      let conditions = cursor ? gt(resources.id, cursor) : undefined

      if (locationId) {
        conditions = conditions
          ? and(conditions, eq(resources.locationId, locationId))
          : eq(resources.locationId, locationId)
      }

      return tx
        .select()
        .from(resources)
        .where(conditions)
        .limit(limit + 1)
        .orderBy(resources.id)
    })

    const hasMore = results.length > limit
    const items = hasMore ? results.slice(0, limit) : results

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    }
  })

// Get single resource by ID
export const get = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const { id } = input
    const { orgId } = context

    const [resource] = await withOrg(orgId, async (tx) => {
      return tx.select().from(resources).where(eq(resources.id, id)).limit(1)
    })

    if (!resource) {
      throw new ORPCError('NOT_FOUND', { message: 'Resource not found' })
    }

    return resource
  })

// Create resource
export const create = authed
  .input(createResourceSchema)
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

    const [resource] = await withOrg(orgId, async (tx) => {
      return tx
        .insert(resources)
        .values({
          orgId,
          locationId: input.locationId ?? null,
          name: input.name,
          quantity: input.quantity,
        })
        .returning()
    })

    return resource
  })

// Update resource
export const update = authed
  .input(
    z.object({
      id: z.string().uuid(),
      data: updateResourceSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const { id, data } = input
    const { orgId } = context

    // Verify resource exists and belongs to org
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx.select().from(resources).where(eq(resources.id, id)).limit(1)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Resource not found' })
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
        .update(resources)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(resources.id, id))
        .returning()
    })

    return updated
  })

// Delete resource
export const remove = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const { id } = input
    const { orgId } = context

    // Verify resource exists and belongs to org
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx.select().from(resources).where(eq(resources.id, id)).limit(1)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Resource not found' })
    }

    await withOrg(orgId, async (tx) => {
      return tx.delete(resources).where(eq(resources.id, id))
    })

    return { success: true }
  })

// Export as route object
export const resourceRoutes = {
  list,
  get,
  create,
  update,
  remove,
}
