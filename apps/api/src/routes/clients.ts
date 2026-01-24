// oRPC routes for clients CRUD

import { z } from 'zod'
import { eq, gt, or, ilike } from 'drizzle-orm'
import { clients } from '@scheduling/db/schema'
import {
  createClientSchema,
  updateClientSchema,
  listClientsQuerySchema,
} from '@scheduling/dto'
import { authed } from './base.js'
import { withOrg } from '../lib/db.js'
import { ORPCError } from '../lib/orpc.js'
import { events } from '../services/jobs/emitter.js'

// List clients with cursor pagination and optional search
export const list = authed
  .input(listClientsQuerySchema)
  .handler(async ({ input, context }) => {
    const { cursor, limit, search } = input
    const { orgId } = context

    const results = await withOrg(orgId, async (tx) => {
      let query = tx.select().from(clients).$dynamic()

      // Apply cursor pagination
      if (cursor) {
        query = query.where(gt(clients.id, cursor))
      }

      // Apply search filter if provided
      if (search) {
        const searchPattern = `%${search}%`
        query = query.where(
          or(
            ilike(clients.firstName, searchPattern),
            ilike(clients.lastName, searchPattern),
            ilike(clients.email, searchPattern)
          )
        )
      }

      return query.limit(limit + 1).orderBy(clients.id)
    })

    const hasMore = results.length > limit
    const items = hasMore ? results.slice(0, limit) : results

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    }
  })

// Get single client by ID
export const get = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const { id } = input
    const { orgId } = context

    const [client] = await withOrg(orgId, async (tx) => {
      return tx.select().from(clients).where(eq(clients.id, id)).limit(1)
    })

    if (!client) {
      throw new ORPCError('NOT_FOUND', { message: 'Client not found' })
    }

    return client
  })

// Create client
export const create = authed
  .input(createClientSchema)
  .handler(async ({ input, context }) => {
    const { orgId } = context

    const [client] = await withOrg(orgId, async (tx) => {
      return tx
        .insert(clients)
        .values({
          orgId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email ?? null,
          phone: input.phone ?? null,
        })
        .returning()
    })

    // Emit client created event
    await events.clientCreated(orgId, {
      clientId: client!.id,
      firstName: client!.firstName,
      lastName: client!.lastName,
      email: client!.email,
    })

    return client
  })

// Update client
export const update = authed
  .input(
    z.object({
      id: z.string().uuid(),
      data: updateClientSchema,
    })
  )
  .handler(async ({ input, context }) => {
    const { id, data } = input
    const { orgId } = context

    // Verify client exists and belongs to org
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx.select().from(clients).where(eq(clients.id, id)).limit(1)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Client not found' })
    }

    const [updated] = await withOrg(orgId, async (tx) => {
      return tx
        .update(clients)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(clients.id, id))
        .returning()
    })

    // Emit client updated event
    await events.clientUpdated(orgId, {
      clientId: updated!.id,
      changes: data,
      previous: {
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        phone: existing.phone,
      },
    })

    return updated
  })

// Delete client
export const remove = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    const { id } = input
    const { orgId } = context

    // Verify client exists and belongs to org
    const [existing] = await withOrg(orgId, async (tx) => {
      return tx.select().from(clients).where(eq(clients.id, id)).limit(1)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Client not found' })
    }

    await withOrg(orgId, async (tx) => {
      return tx.delete(clients).where(eq(clients.id, id))
    })

    // Emit client deleted event
    await events.clientDeleted(orgId, {
      clientId: id,
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
    })

    return { success: true }
  })

// Export as route object
export const clientRoutes = {
  list,
  get,
  create,
  update,
  remove,
}
