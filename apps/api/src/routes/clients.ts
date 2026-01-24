// oRPC routes for clients CRUD

import { z } from "zod";
import { createClientSchema, updateClientSchema, listClientsQuerySchema } from "@scheduling/dto";
import { authed } from "./base.js";
import { clientService } from "../services/clients.js";

// List clients with cursor pagination and optional search
export const list = authed.input(listClientsQuerySchema).handler(async ({ input, context }) => {
  return clientService.list(input, {
    orgId: context.orgId,
    userId: context.userId!,
  });
});

// Get single client by ID
export const get = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    return clientService.get(input.id, {
      orgId: context.orgId,
      userId: context.userId!,
    });
  });

// Create client
export const create = authed.input(createClientSchema).handler(async ({ input, context }) => {
  return clientService.create(input, {
    orgId: context.orgId,
    userId: context.userId!,
  });
});

// Update client
export const update = authed
  .input(
    z.object({
      id: z.string().uuid(),
      data: updateClientSchema,
    }),
  )
  .handler(async ({ input, context }) => {
    return clientService.update(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId!,
    });
  });

// Delete client
export const remove = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input, context }) => {
    return clientService.delete(input.id, {
      orgId: context.orgId,
      userId: context.userId!,
    });
  });

// Export as route object
export const clientRoutes = {
  list,
  get,
  create,
  update,
  remove,
};
