// Client service - business logic layer for clients

import { clientRepository } from "../repositories/clients.js";
import type {
  ClientCreateInput,
  ClientUpdateInput,
  Client,
  ClientListInput,
} from "../repositories/clients.js";
import type { PaginatedResult } from "../repositories/base.js";
import { withRls } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import { events } from "./jobs/emitter.js";
import { requireOrgId } from "../lib/request-context.js";

export class ClientService {
  async list(input: ClientListInput): Promise<PaginatedResult<Client>> {
    return withRls((tx) => clientRepository.findMany(tx, input));
  }

  async get(id: string): Promise<Client> {
    return withRls(async (tx) => {
      const client = await clientRepository.findById(tx, id);

      if (!client) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      return client;
    });
  }

  async create(input: ClientCreateInput): Promise<Client> {
    const orgId = requireOrgId();
    return withRls(async (tx) => {
      const client = await clientRepository.create(tx, input);

      await events.clientCreated(
        orgId,
        {
          clientId: client.id,
          firstName: client.firstName,
          lastName: client.lastName,
          email: client.email,
        },
        tx,
      );

      return client;
    });
  }

  async update(id: string, data: ClientUpdateInput): Promise<Client> {
    const orgId = requireOrgId();
    return withRls(async (tx) => {
      // Get existing for event payload
      const existing = await clientRepository.findById(tx, id);

      if (!existing) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      const updated = await clientRepository.update(tx, id, data);

      if (!updated) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      await events.clientUpdated(
        orgId,
        {
          clientId: updated.id,
          changes: data,
          previous: {
            firstName: existing.firstName,
            lastName: existing.lastName,
            email: existing.email,
            phone: existing.phone,
          },
        },
        tx,
      );

      return updated;
    });
  }

  async delete(id: string): Promise<{ success: true }> {
    const orgId = requireOrgId();
    return withRls(async (tx) => {
      // Get existing for event payload
      const existing = await clientRepository.findById(tx, id);

      if (!existing) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      await clientRepository.delete(tx, id);

      await events.clientDeleted(
        orgId,
        {
          clientId: id,
          firstName: existing.firstName,
          lastName: existing.lastName,
          email: existing.email,
        },
        tx,
      );

      return { success: true };
    });
  }
}

// Singleton instance
export const clientService = new ClientService();
