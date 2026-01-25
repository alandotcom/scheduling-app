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
import { withRls } from "../lib/db.js";
import { requireOrgId } from "../lib/request-context.js";
import { ApplicationError } from "../errors/application-error.js";
import { events } from "./jobs/emitter.js";

export class ResourceService {
  async list(input: ResourceListInput): Promise<PaginatedResult<Resource>> {
    return withRls((tx) => resourceRepository.findMany(tx, input));
  }

  async get(id: string): Promise<Resource> {
    return withRls(async (tx) => {
      const resource = await resourceRepository.findById(tx, id);

      if (!resource) {
        throw new ApplicationError("Resource not found", { code: "NOT_FOUND" });
      }

      return resource;
    });
  }

  async create(input: ResourceCreateInput): Promise<Resource> {
    const orgId = requireOrgId();
    return withRls(async (tx) => {
      // Validate location exists if provided
      if (input.locationId) {
        const location = await locationRepository.findById(
          tx,
          input.locationId,
        );

        if (!location) {
          throw new ApplicationError("Location not found", {
            code: "NOT_FOUND",
          });
        }
      }

      const resource = await resourceRepository.create(tx, input);

      await events.resourceCreated(
        orgId,
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

  async update(id: string, data: ResourceUpdateInput): Promise<Resource> {
    const orgId = requireOrgId();
    return withRls(async (tx) => {
      // Get existing for event payload
      const existing = await resourceRepository.findById(tx, id);

      if (!existing) {
        throw new ApplicationError("Resource not found", { code: "NOT_FOUND" });
      }

      // Validate location exists if being updated
      if (data.locationId !== undefined && data.locationId !== null) {
        const location = await locationRepository.findById(tx, data.locationId);

        if (!location) {
          throw new ApplicationError("Location not found", {
            code: "NOT_FOUND",
          });
        }
      }

      const updated = await resourceRepository.update(tx, id, data);

      if (!updated) {
        throw new ApplicationError("Resource not found", { code: "NOT_FOUND" });
      }

      await events.resourceUpdated(
        orgId,
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

  async delete(id: string): Promise<{ success: true }> {
    const orgId = requireOrgId();
    return withRls(async (tx) => {
      // Get existing for event payload
      const existing = await resourceRepository.findById(tx, id);

      if (!existing) {
        throw new ApplicationError("Resource not found", { code: "NOT_FOUND" });
      }

      await resourceRepository.delete(tx, id);

      await events.resourceDeleted(
        orgId,
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
