// Client service - business logic layer for clients

import { clientRepository } from '../repositories/clients.js'
import type { ClientCreateInput, ClientUpdateInput, Client, ClientListInput } from '../repositories/clients.js'
import type { PaginatedResult } from '../repositories/base.js'
import { db, type Database } from '../lib/db.js'
import { ORPCError } from '../lib/orpc.js'
import { events } from './jobs/emitter.js'
import type { ServiceContext } from './locations.js'

export class ClientService {
  async list(
    input: ClientListInput,
    context: ServiceContext
  ): Promise<PaginatedResult<Client>> {
    return db.transaction(async (tx) => {
      return clientRepository.findMany(tx as unknown as Database, context.orgId, input)
    })
  }

  async get(id: string, context: ServiceContext): Promise<Client> {
    const client = await db.transaction(async (tx) => {
      return clientRepository.findById(tx as unknown as Database, context.orgId, id)
    })

    if (!client) {
      throw new ORPCError('NOT_FOUND', { message: 'Client not found' })
    }

    return client
  }

  async create(input: ClientCreateInput, context: ServiceContext): Promise<Client> {
    const client = await db.transaction(async (tx) => {
      return clientRepository.create(tx as unknown as Database, context.orgId, input)
    })

    await events.clientCreated(context.orgId, {
      clientId: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
    })

    return client
  }

  async update(
    id: string,
    data: ClientUpdateInput,
    context: ServiceContext
  ): Promise<Client> {
    // Get existing for event payload
    const existing = await db.transaction(async (tx) => {
      return clientRepository.findById(tx as unknown as Database, context.orgId, id)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Client not found' })
    }

    const updated = await db.transaction(async (tx) => {
      return clientRepository.update(tx as unknown as Database, context.orgId, id, data)
    })

    if (!updated) {
      throw new ORPCError('NOT_FOUND', { message: 'Client not found' })
    }

    await events.clientUpdated(context.orgId, {
      clientId: updated.id,
      changes: data,
      previous: {
        firstName: existing.firstName,
        lastName: existing.lastName,
        email: existing.email,
        phone: existing.phone,
      },
    })

    return updated
  }

  async delete(id: string, context: ServiceContext): Promise<{ success: true }> {
    // Get existing for event payload
    const existing = await db.transaction(async (tx) => {
      return clientRepository.findById(tx as unknown as Database, context.orgId, id)
    })

    if (!existing) {
      throw new ORPCError('NOT_FOUND', { message: 'Client not found' })
    }

    await db.transaction(async (tx) => {
      return clientRepository.delete(tx as unknown as Database, context.orgId, id)
    })

    await events.clientDeleted(context.orgId, {
      clientId: id,
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
    })

    return { success: true }
  }
}

// Singleton instance
export const clientService = new ClientService()
