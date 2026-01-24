// Location service - business logic layer for locations

import { locationRepository } from '../repositories/locations.js'
import type { LocationCreateInput, LocationUpdateInput, Location } from '../repositories/locations.js'
import type { PaginationInput, PaginatedResult } from '../repositories/base.js'
import { db, type Database } from '../lib/db.js'
import { ORPCError } from '../lib/orpc.js'
import { events } from './jobs/emitter.js'

export interface ServiceContext {
  orgId: string
  userId: string
}

export class LocationService {
  async list(
    input: PaginationInput,
    context: ServiceContext
  ): Promise<PaginatedResult<Location>> {
    return db.transaction(async (tx) => {
      return locationRepository.findMany(tx as unknown as Database, context.orgId, input)
    })
  }

  async get(id: string, context: ServiceContext): Promise<Location> {
    const location = await db.transaction(async (tx) => {
      return locationRepository.findById(tx as unknown as Database, context.orgId, id)
    })

    if (!location) {
      throw new ORPCError('NOT_FOUND', { message: 'Location not found' })
    }

    return location
  }

  async create(input: LocationCreateInput, context: ServiceContext): Promise<Location> {
    const location = await db.transaction(async (tx) => {
      return locationRepository.create(tx as unknown as Database, context.orgId, input)
    })

    await events.locationCreated(context.orgId, {
      locationId: location.id,
      name: location.name,
      timezone: location.timezone,
    })

    return location
  }

  async update(
    id: string,
    data: LocationUpdateInput,
    context: ServiceContext
  ): Promise<Location> {
    // Get existing for event payload
    const existing = await db.transaction(async (tx) => {
      return locationRepository.findById(tx as unknown as Database, context.orgId, id)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Location not found' })
    }

    const updated = await db.transaction(async (tx) => {
      return locationRepository.update(tx as unknown as Database, context.orgId, id, data)
    })

    if (!updated) {
      throw new ORPCError('NOT_FOUND', { message: 'Location not found' })
    }

    await events.locationUpdated(context.orgId, {
      locationId: updated.id,
      changes: data,
      previous: {
        name: existing.name,
        timezone: existing.timezone,
      },
    })

    return updated
  }

  async delete(id: string, context: ServiceContext): Promise<{ success: true }> {
    // Get existing for event payload
    const existing = await db.transaction(async (tx) => {
      return locationRepository.findById(tx as unknown as Database, context.orgId, id)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Location not found' })
    }

    await db.transaction(async (tx) => {
      return locationRepository.delete(tx as unknown as Database, context.orgId, id)
    })

    await events.locationDeleted(context.orgId, {
      locationId: id,
      name: existing.name,
      timezone: existing.timezone,
    })

    return { success: true }
  }
}

// Singleton instance
export const locationService = new LocationService()
