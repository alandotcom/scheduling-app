// oRPC routes for resources CRUD

import { z } from "zod";
import {
  createResourceSchema,
  updateResourceSchema,
  listResourcesQuerySchema,
  resourceResponseSchema,
  resourceListResponseSchema,
  successResponseSchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { resourceService } from "../services/resources.js";

// List resources with cursor pagination and optional location filter
export const list = authed
  .route({ method: "GET", path: "/resources" })
  .input(listResourcesQuerySchema)
  .output(resourceListResponseSchema)
  .handler(async ({ input, context }) => {
    return resourceService.list(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Get single resource by ID
export const get = authed
  .route({ method: "GET", path: "/resources/{id}" })
  .input(z.object({ id: z.string().uuid() }))
  .output(resourceResponseSchema)
  .handler(async ({ input, context }) => {
    return resourceService.get(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Create resource
export const create = authed
  .route({ method: "POST", path: "/resources", successStatus: 201 })
  .input(createResourceSchema)
  .output(resourceResponseSchema)
  .handler(async ({ input, context }) => {
    return resourceService.create(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Update resource
export const update = authed
  .route({ method: "PATCH", path: "/resources/{id}" })
  .input(
    z.object({
      id: z.string().uuid(),
      data: updateResourceSchema,
    }),
  )
  .output(resourceResponseSchema)
  .handler(async ({ input, context }) => {
    return resourceService.update(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Delete resource
export const remove = authed
  .route({ method: "DELETE", path: "/resources/{id}" })
  .input(z.object({ id: z.string().uuid() }))
  .output(successResponseSchema)
  .handler(async ({ input, context }) => {
    return resourceService.delete(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Export as route object
export const resourceRoutes = {
  list,
  get,
  create,
  update,
  remove,
};
