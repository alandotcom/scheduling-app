// oRPC routes for resources CRUD

import { z } from "zod";
import {
  createResourceSchema,
  updateResourceSchema,
  listResourcesQuerySchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { resourceService } from "../services/resources.js";

// List resources with cursor pagination and optional location filter
export const list = authed
  .input(listResourcesQuerySchema)
  .handler(async ({ input }) => {
    return resourceService.list(input);
  });

// Get single resource by ID
export const get = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input }) => {
    return resourceService.get(input.id);
  });

// Create resource
export const create = authed
  .input(createResourceSchema)
  .handler(async ({ input }) => {
    return resourceService.create(input);
  });

// Update resource
export const update = authed
  .input(
    z.object({
      id: z.string().uuid(),
      data: updateResourceSchema,
    }),
  )
  .handler(async ({ input }) => {
    return resourceService.update(input.id, input.data);
  });

// Delete resource
export const remove = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input }) => {
    return resourceService.delete(input.id);
  });

// Export as route object
export const resourceRoutes = {
  list,
  get,
  create,
  update,
  remove,
};
