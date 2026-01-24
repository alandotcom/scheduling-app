// Location service - business logic layer for locations

import { locationRepository } from "../repositories/locations.js";
import type {
  LocationCreateInput,
  LocationUpdateInput,
  Location,
} from "../repositories/locations.js";
import type { PaginationInput, PaginatedResult } from "../repositories/base.js";
import { withOrg } from "../lib/db.js";
import { ORPCError } from "../lib/orpc.js";
import { events } from "./jobs/emitter.js";

export interface ServiceContext {
  orgId: string;
  userId: string;
}

export class LocationService {
  async list(input: PaginationInput, context: ServiceContext): Promise<PaginatedResult<Location>> {
    return withOrg(context.orgId, (tx) => locationRepository.findMany(tx, context.orgId, input));
  }

  async get(id: string, context: ServiceContext): Promise<Location> {
    return withOrg(context.orgId, async (tx) => {
      const location = await locationRepository.findById(tx, context.orgId, id);

      if (!location) {
        throw new ORPCError("NOT_FOUND", { message: "Location not found" });
      }

      return location;
    });
  }

  async create(input: LocationCreateInput, context: ServiceContext): Promise<Location> {
    return withOrg(context.orgId, async (tx) => {
      const location = await locationRepository.create(tx, context.orgId, input);

      await events.locationCreated(
        context.orgId,
        {
          locationId: location.id,
          name: location.name,
          timezone: location.timezone,
        },
        tx,
      );

      return location;
    });
  }

  async update(id: string, data: LocationUpdateInput, context: ServiceContext): Promise<Location> {
    return withOrg(context.orgId, async (tx) => {
      // Get existing for event payload
      const existing = await locationRepository.findById(tx, context.orgId, id);

      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "Location not found" });
      }

      const updated = await locationRepository.update(tx, context.orgId, id, data);

      if (!updated) {
        throw new ORPCError("NOT_FOUND", { message: "Location not found" });
      }

      await events.locationUpdated(
        context.orgId,
        {
          locationId: updated.id,
          changes: data,
          previous: {
            name: existing.name,
            timezone: existing.timezone,
          },
        },
        tx,
      );

      return updated;
    });
  }

  async delete(id: string, context: ServiceContext): Promise<{ success: true }> {
    return withOrg(context.orgId, async (tx) => {
      // Get existing for event payload
      const existing = await locationRepository.findById(tx, context.orgId, id);

      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "Location not found" });
      }

      await locationRepository.delete(tx, context.orgId, id);

      await events.locationDeleted(
        context.orgId,
        {
          locationId: id,
          name: existing.name,
          timezone: existing.timezone,
        },
        tx,
      );

      return { success: true };
    });
  }
}

// Singleton instance
export const locationService = new LocationService();
