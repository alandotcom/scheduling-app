// oRPC routes for locations CRUD

import { z } from "zod";
import {
  createLocationSchema,
  updateLocationSchema,
  listLocationsQuerySchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { locationService } from "../services/locations.js";

// List locations with cursor pagination
export const list = authed
  .input(listLocationsQuerySchema)
  .handler(async ({ input }) => {
    return locationService.list(input);
  });

// Get single location by ID
export const get = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input }) => {
    return locationService.get(input.id);
  });

// Create location
export const create = authed
  .input(createLocationSchema)
  .handler(async ({ input }) => {
    return locationService.create(input);
  });

// Update location
export const update = authed
  .input(
    z.object({
      id: z.string().uuid(),
      data: updateLocationSchema,
    }),
  )
  .handler(async ({ input }) => {
    return locationService.update(input.id, input.data);
  });

// Delete location
export const remove = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input }) => {
    return locationService.delete(input.id);
  });

// Export as route object
export const locationRoutes = {
  list,
  get,
  create,
  update,
  remove,
};
