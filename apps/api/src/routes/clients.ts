// oRPC routes for clients CRUD

import { z } from "zod";
import {
  createClientSchema,
  updateClientSchema,
  listClientsQuerySchema,
  clientHistorySummarySchema,
  clientResponseSchema,
  clientListResponseSchema,
  successResponseSchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { clientService } from "../services/clients.js";

// List clients with cursor pagination and optional search
export const list = authed
  .route({ method: "GET", path: "/clients" })
  .input(listClientsQuerySchema)
  .output(clientListResponseSchema)
  .handler(async ({ input, context }) => {
    return clientService.list(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Get single client by ID
export const get = authed
  .route({ method: "GET", path: "/clients/{id}" })
  .input(z.object({ id: z.string().uuid() }))
  .output(clientResponseSchema)
  .handler(async ({ input, context }) => {
    return clientService.get(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Create client
export const create = authed
  .route({ method: "POST", path: "/clients", successStatus: 201 })
  .input(createClientSchema)
  .output(clientResponseSchema)
  .handler(async ({ input, context }) => {
    return clientService.create(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Update client
export const update = authed
  .route({ method: "PATCH", path: "/clients/{id}" })
  .input(
    z.object({
      id: z.string().uuid(),
      data: updateClientSchema,
    }),
  )
  .output(clientResponseSchema)
  .handler(async ({ input, context }) => {
    return clientService.update(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Delete client
export const remove = authed
  .route({ method: "DELETE", path: "/clients/{id}" })
  .input(z.object({ id: z.string().uuid() }))
  .output(successResponseSchema)
  .handler(async ({ input, context }) => {
    return clientService.delete(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Client history summary
export const historySummary = authed
  .route({ method: "GET", path: "/clients/{id}/history-summary" })
  .input(z.object({ id: z.string().uuid() }))
  .output(clientHistorySummarySchema)
  .handler(async ({ input, context }) => {
    const result = await clientService.historySummary(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
    return clientHistorySummarySchema.parse(result);
  });

// Export as route object
export const clientRoutes = {
  list,
  get,
  create,
  update,
  remove,
  historySummary,
};
