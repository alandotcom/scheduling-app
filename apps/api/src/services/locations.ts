// Location service - business logic layer for locations

import { locationRepository } from "../repositories/locations.js";
import type {
  LocationCreateInput,
  LocationUpdateInput,
  Location,
  LocationWithRelationshipCounts,
} from "../repositories/locations.js";
import type { PaginationInput, PaginatedResult } from "../repositories/base.js";
import { withOrg } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import { events } from "./jobs/emitter.js";

export interface ServiceContext {
  orgId: string;
  userId: string;
}

export class LocationService {
  async list(
    input: PaginationInput,
    context: ServiceContext,
  ): Promise<PaginatedResult<LocationWithRelationshipCounts>> {
    return withOrg(context.orgId, (tx) =>
      locationRepository.findMany(tx, context.orgId, input),
    );
  }

  async get(id: string, context: ServiceContext): Promise<Location> {
    return withOrg(context.orgId, async (tx) => {
      const location = await locationRepository.findById(tx, context.orgId, id);

      if (!location) {
        throw new ApplicationError("Location not found", { code: "NOT_FOUND" });
      }

      return location;
    });
  }

  async create(
    input: LocationCreateInput,
    context: ServiceContext,
  ): Promise<Location> {
    const location = await withOrg(context.orgId, async (tx) => {
      const location = await locationRepository.create(
        tx,
        context.orgId,
        input,
      );

      return location;
    });

    await events.locationCreated(context.orgId, {
      locationId: location.id,
      name: location.name,
      timezone: location.timezone,
    });

    return location;
  }

  async update(
    id: string,
    data: LocationUpdateInput,
    context: ServiceContext,
  ): Promise<Location> {
    const { existing, updated } = await withOrg(context.orgId, async (tx) => {
      // Get existing for event payload
      const existing = await locationRepository.findById(tx, context.orgId, id);

      if (!existing) {
        throw new ApplicationError("Location not found", { code: "NOT_FOUND" });
      }

      const updated = await locationRepository.update(
        tx,
        context.orgId,
        id,
        data,
      );

      if (!updated) {
        throw new ApplicationError("Location not found", { code: "NOT_FOUND" });
      }

      return { existing, updated };
    });

    await events.locationUpdated(context.orgId, {
      locationId: updated.id,
      changes: data,
      previous: {
        name: existing.name,
        timezone: existing.timezone,
      },
    });

    return updated;
  }

  async delete(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    const deleted = await withOrg(context.orgId, async (tx) => {
      // Get existing for event payload
      const existing = await locationRepository.findById(tx, context.orgId, id);

      if (!existing) {
        throw new ApplicationError("Location not found", { code: "NOT_FOUND" });
      }

      await locationRepository.delete(tx, context.orgId, id);

      return {
        locationId: id,
        name: existing.name,
        timezone: existing.timezone,
      };
    });

    await events.locationDeleted(context.orgId, deleted);

    return { success: true };
  }
}

// Singleton instance
export const locationService = new LocationService();
