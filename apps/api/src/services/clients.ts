// Client service - business logic layer for clients

import { clientRepository } from "../repositories/clients.js";
import type {
  ClientCreateInput,
  ClientUpdateInput,
  Client,
  ClientListInput,
  ClientWithRelationshipCounts,
} from "../repositories/clients.js";
import type { PaginatedResult } from "../repositories/base.js";
import { withOrg } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import { events } from "./jobs/emitter.js";
import type { ServiceContext } from "./locations.js";
import type { ClientHistorySummary } from "@scheduling/dto";

export class ClientService {
  async list(
    input: ClientListInput,
    context: ServiceContext,
  ): Promise<PaginatedResult<ClientWithRelationshipCounts>> {
    return withOrg(context.orgId, (tx) =>
      clientRepository.findMany(tx, context.orgId, input),
    );
  }

  async get(id: string, context: ServiceContext): Promise<Client> {
    return withOrg(context.orgId, async (tx) => {
      const client = await clientRepository.findById(tx, context.orgId, id);

      if (!client) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      return client;
    });
  }

  async create(
    input: ClientCreateInput,
    context: ServiceContext,
  ): Promise<Client> {
    return withOrg(context.orgId, async (tx) => {
      const client = await clientRepository.create(tx, context.orgId, input);

      await events.clientCreated(
        context.orgId,
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

  async update(
    id: string,
    data: ClientUpdateInput,
    context: ServiceContext,
  ): Promise<Client> {
    return withOrg(context.orgId, async (tx) => {
      // Get existing for event payload
      const existing = await clientRepository.findById(tx, context.orgId, id);

      if (!existing) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      const updated = await clientRepository.update(
        tx,
        context.orgId,
        id,
        data,
      );

      if (!updated) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      await events.clientUpdated(
        context.orgId,
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

  async delete(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    return withOrg(context.orgId, async (tx) => {
      // Get existing for event payload
      const existing = await clientRepository.findById(tx, context.orgId, id);

      if (!existing) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      await clientRepository.delete(tx, context.orgId, id);

      await events.clientDeleted(
        context.orgId,
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

  async historySummary(
    id: string,
    context: ServiceContext,
  ): Promise<ClientHistorySummary> {
    return withOrg(context.orgId, async (tx) => {
      const client = await clientRepository.findById(tx, context.orgId, id);

      if (!client) {
        throw new ApplicationError("Client not found", { code: "NOT_FOUND" });
      }

      const summary = await clientRepository.getHistorySummary(
        tx,
        context.orgId,
        id,
      );

      return {
        clientId: id,
        ...summary,
      };
    });
  }
}

// Singleton instance
export const clientService = new ClientService();
