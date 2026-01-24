// Resource service - business logic layer for resources

import { resourceRepository } from "../repositories/resources.js";
import { locationRepository } from "../repositories/locations.js";
import type {
  ResourceCreateInput,
  ResourceUpdateInput,
  Resource,
  ResourceListInput,
} from "../repositories/resources.js";
import type { PaginatedResult } from "../repositories/base.js";
import { withOrg } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import { events } from "./jobs/emitter.js";
import type { ServiceContext } from "./locations.js";

export class ResourceService {
  async list(
    input: ResourceListInput,
    context: ServiceContext,
  ): Promise<PaginatedResult<Resource>> {
    return withOrg(context.orgId, (tx) =>
      resourceRepository.findMany(tx, context.orgId, input),
    );
  }

  async get(id: string, context: ServiceContext): Promise<Resource> {
    return withOrg(context.orgId, async (tx) => {
      const resource = await resourceRepository.findById(tx, context.orgId, id);

      if (!resource) {
        throw new ApplicationError("Resource not found", { code: "NOT_FOUND" });
      }

      return resource;
    });
  }

  async create(
    input: ResourceCreateInput,
    context: ServiceContext,
  ): Promise<Resource> {
    return withOrg(context.orgId, async (tx) => {
      // Validate location exists if provided
      if (input.locationId) {
        const location = await locationRepository.findById(
          tx,
          context.orgId,
          input.locationId,
        );

        if (!location) {
          throw new ApplicationError("Location not found", {
            code: "NOT_FOUND",
          });
        }
      }

      const resource = await resourceRepository.create(
        tx,
        context.orgId,
        input,
      );

      await events.resourceCreated(
        context.orgId,
        {
          resourceId: resource.id,
          name: resource.name,
          quantity: resource.quantity,
          locationId: resource.locationId,
        },
        tx,
      );

      return resource;
    });
  }

  async update(
    id: string,
    data: ResourceUpdateInput,
    context: ServiceContext,
  ): Promise<Resource> {
    return withOrg(context.orgId, async (tx) => {
      // Get existing for event payload
      const existing = await resourceRepository.findById(tx, context.orgId, id);

      if (!existing) {
        throw new ApplicationError("Resource not found", { code: "NOT_FOUND" });
      }

      // Validate location exists if being updated
      if (data.locationId !== undefined && data.locationId !== null) {
        const location = await locationRepository.findById(
          tx,
          context.orgId,
          data.locationId,
        );

        if (!location) {
          throw new ApplicationError("Location not found", {
            code: "NOT_FOUND",
          });
        }
      }

      const updated = await resourceRepository.update(
        tx,
        context.orgId,
        id,
        data,
      );

      if (!updated) {
        throw new ApplicationError("Resource not found", { code: "NOT_FOUND" });
      }

      await events.resourceUpdated(
        context.orgId,
        {
          resourceId: updated.id,
          changes: data,
          previous: {
            name: existing.name,
            quantity: existing.quantity,
            locationId: existing.locationId,
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
      const existing = await resourceRepository.findById(tx, context.orgId, id);

      if (!existing) {
        throw new ApplicationError("Resource not found", { code: "NOT_FOUND" });
      }

      await resourceRepository.delete(tx, context.orgId, id);

      await events.resourceDeleted(
        context.orgId,
        {
          resourceId: id,
          name: existing.name,
          quantity: existing.quantity,
          locationId: existing.locationId,
        },
        tx,
      );

      return { success: true };
    });
  }
}

// Singleton instance
export const resourceService = new ResourceService();
