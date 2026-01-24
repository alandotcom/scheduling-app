// oRPC routes for resources CRUD

import { z } from 'zod'
import {
  createResourceSchema,
  updateResourceSchema,
  listResourcesQuerySchema,
} from '@scheduling/dto'
import { authed } from './base.js'
import { resourceService } from '../services/resources.js'

// List resources with cursor pagination and optional location filter
export const list = authed
  .input(listResourcesQuerySchema)
  .handler(async ({ input, context }) => {
    return resourceService.list(input, {
      orgId: context.orgId,
      userId: context.userId!,
    })
  })

// Get single resource by ID
export const get = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    return resourceService.get(input.id, {
      orgId: context.orgId,
      userId: context.userId!,
    })
  })

// Create resource
export const create = authed
  .input(createResourceSchema)
  .handler(async ({ input, context }) => {
    return resourceService.create(input, {
      orgId: context.orgId,
      userId: context.userId!,
    })
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
    return resourceService.update(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId!,
    })
  })

// Delete resource
export const remove = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    return resourceService.delete(input.id, {
      orgId: context.orgId,
      userId: context.userId!,
    })
  })

// Export as route object
export const resourceRoutes = {
  list,
  get,
  create,
  update,
  remove,
}
