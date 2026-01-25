// Location service - business logic layer for locations

import { locationRepository } from "../repositories/locations.js";
import type {
  LocationCreateInput,
  LocationUpdateInput,
  Location,
} from "../repositories/locations.js";
import type { PaginationInput, PaginatedResult } from "../repositories/base.js";
import { withRls } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import { events } from "./jobs/emitter.js";
import { requireOrgId } from "../lib/request-context.js";

export class LocationService {
  async list(input: PaginationInput): Promise<PaginatedResult<Location>> {
    return withRls((tx) => locationRepository.findMany(tx, input));
  }

  async get(id: string): Promise<Location> {
    return withRls(async (tx) => {
      const location = await locationRepository.findById(tx, id);

      if (!location) {
        throw new ApplicationError("Location not found", { code: "NOT_FOUND" });
      }

      return location;
    });
  }

  async create(input: LocationCreateInput): Promise<Location> {
    const orgId = requireOrgId(); // For event payload
    return withRls(async (tx) => {
      const location = await locationRepository.create(tx, input);

      await events.locationCreated(
        orgId,
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

  async update(id: string, data: LocationUpdateInput): Promise<Location> {
    const orgId = requireOrgId(); // For event payload
    return withRls(async (tx) => {
      // Get existing for event payload
      const existing = await locationRepository.findById(tx, id);

      if (!existing) {
        throw new ApplicationError("Location not found", { code: "NOT_FOUND" });
      }

      const updated = await locationRepository.update(tx, id, data);

      if (!updated) {
        throw new ApplicationError("Location not found", { code: "NOT_FOUND" });
      }

      await events.locationUpdated(
        orgId,
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

  async delete(id: string): Promise<{ success: true }> {
    const orgId = requireOrgId(); // For event payload
    return withRls(async (tx) => {
      // Get existing for event payload
      const existing = await locationRepository.findById(tx, id);

      if (!existing) {
        throw new ApplicationError("Location not found", { code: "NOT_FOUND" });
      }

      await locationRepository.delete(tx, id);

      await events.locationDeleted(
        orgId,
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
