// oRPC routes for locations CRUD

import { z } from "zod";
import {
  createLocationSchema,
  updateLocationSchema,
  listLocationsQuerySchema,
  locationResponseSchema,
  locationListResponseSchema,
  successResponseSchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { locationService } from "../services/locations.js";

// List locations with cursor pagination
export const list = authed
  .route({
    method: "GET",
    path: "/locations",
    tags: ["Locations"],
    summary: "List locations",
    description: "Returns locations for the active organization.",
  })
  .input(listLocationsQuerySchema)
  .output(locationListResponseSchema)
  .handler(async ({ input, context }) => {
    return locationService.list(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Get single location by ID
export const get = authed
  .route({
    method: "GET",
    path: "/locations/{id}",
    tags: ["Locations"],
    summary: "Get location",
    description: "Returns one location by ID.",
  })
  .input(z.object({ id: z.uuid() }))
  .output(locationResponseSchema)
  .handler(async ({ input, context }) => {
    return locationService.get(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Create location
export const create = authed
  .route({
    method: "POST",
    path: "/locations",
    successStatus: 201,
    tags: ["Locations"],
    summary: "Create location",
    description: "Creates a new location.",
  })
  .input(createLocationSchema)
  .output(locationResponseSchema)
  .handler(async ({ input, context }) => {
    return locationService.create(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Update location
export const update = authed
  .route({
    method: "PATCH",
    path: "/locations/{id}",
    tags: ["Locations"],
    summary: "Update location",
    description: "Updates an existing location.",
  })
  .input(
    updateLocationSchema.extend({
      id: z.uuid(),
    }),
  )
  .output(locationResponseSchema)
  .handler(async ({ input, context }) => {
    const { id, ...data } = input;
    return locationService.update(id, data, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Delete location
export const remove = authed
  .route({
    method: "DELETE",
    path: "/locations/{id}",
    tags: ["Locations"],
    summary: "Delete location",
    description: "Deletes a location.",
  })
  .input(z.object({ id: z.uuid() }))
  .output(successResponseSchema)
  .handler(async ({ input, context }) => {
    return locationService.delete(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Export as route object
export const locationRoutes = {
  list,
  get,
  create,
  update,
  remove,
};
