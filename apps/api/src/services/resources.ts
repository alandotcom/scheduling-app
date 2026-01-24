// Resource service - business logic layer for resources

import { resourceRepository } from '../repositories/resources.js'
import { locationRepository } from '../repositories/locations.js'
import type { ResourceCreateInput, ResourceUpdateInput, Resource, ResourceListInput } from '../repositories/resources.js'
import type { PaginatedResult } from '../repositories/base.js'
import { db, type Database } from '../lib/db.js'
import { ORPCError } from '../lib/orpc.js'
import { events } from './jobs/emitter.js'
import type { ServiceContext } from './locations.js'

export class ResourceService {
  async list(
    input: ResourceListInput,
    context: ServiceContext
  ): Promise<PaginatedResult<Resource>> {
    return db.transaction(async (tx) => {
      return resourceRepository.findMany(tx as unknown as Database, context.orgId, input)
    })
  }

  async get(id: string, context: ServiceContext): Promise<Resource> {
    const resource = await db.transaction(async (tx) => {
      return resourceRepository.findById(tx as unknown as Database, context.orgId, id)
    })

    if (!resource) {
      throw new ORPCError('NOT_FOUND', { message: 'Resource not found' })
    }

    return resource
  }

  async create(input: ResourceCreateInput, context: ServiceContext): Promise<Resource> {
    // Validate location exists if provided
    if (input.locationId) {
      const location = await db.transaction(async (tx) => {
        return locationRepository.findById(tx as unknown as Database, context.orgId, input.locationId!)
      })

      if (!location) {
        throw new ORPCError('NOT_FOUND', { message: 'Location not found' })
      }
    }

    const resource = await db.transaction(async (tx) => {
      return resourceRepository.create(tx as unknown as Database, context.orgId, input)
    })

    await events.resourceCreated(context.orgId, {
      resourceId: resource.id,
      name: resource.name,
      quantity: resource.quantity,
      locationId: resource.locationId,
    })

    return resource
  }

  async update(
    id: string,
    data: ResourceUpdateInput,
    context: ServiceContext
  ): Promise<Resource> {
    // Get existing for event payload
    const existing = await db.transaction(async (tx) => {
      return resourceRepository.findById(tx as unknown as Database, context.orgId, id)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Resource not found' })
    }

    // Validate location exists if being updated
    if (data.locationId !== undefined && data.locationId !== null) {
      const location = await db.transaction(async (tx) => {
        return locationRepository.findById(tx as unknown as Database, context.orgId, data.locationId!)
      })

      if (!location) {
        throw new ORPCError('NOT_FOUND', { message: 'Location not found' })
      }
    }

    const updated = await db.transaction(async (tx) => {
      return resourceRepository.update(tx as unknown as Database, context.orgId, id, data)
    })

    if (!updated) {
      throw new ORPCError('NOT_FOUND', { message: 'Resource not found' })
    }

    await events.resourceUpdated(context.orgId, {
      resourceId: updated.id,
      changes: data,
      previous: {
        name: existing.name,
        quantity: existing.quantity,
        locationId: existing.locationId,
      },
    })

    return updated
  }

  async delete(id: string, context: ServiceContext): Promise<{ success: true }> {
    // Get existing for event payload
    const existing = await db.transaction(async (tx) => {
      return resourceRepository.findById(tx as unknown as Database, context.orgId, id)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Resource not found' })
    }

    await db.transaction(async (tx) => {
      return resourceRepository.delete(tx as unknown as Database, context.orgId, id)
    })

    await events.resourceDeleted(context.orgId, {
      resourceId: id,
      name: existing.name,
      quantity: existing.quantity,
      locationId: existing.locationId,
    })

    return { success: true }
  }
}

// Singleton instance
export const resourceService = new ResourceService()
