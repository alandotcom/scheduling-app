// oRPC routes for clients CRUD

import { z } from "zod";
import {
  createClientSchema,
  updateClientSchema,
  listClientsQuerySchema,
} from "@scheduling/dto";
import { authed } from "./base.js";
import { clientService } from "../services/clients.js";

// List clients with cursor pagination and optional search
export const list = authed
  .input(listClientsQuerySchema)
  .handler(async ({ input }) => {
    return clientService.list(input);
  });

// Get single client by ID
export const get = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input }) => {
    return clientService.get(input.id);
  });

// Create client
export const create = authed
  .input(createClientSchema)
  .handler(async ({ input }) => {
    return clientService.create(input);
  });

// Update client
export const update = authed
  .input(
    z.object({
      id: z.string().uuid(),
      data: updateClientSchema,
    }),
  )
  .handler(async ({ input }) => {
    return clientService.update(input.id, input.data);
  });

// Delete client
export const remove = authed
  .input(z.object({ id: z.string().uuid() }))
  .handler(async ({ input }) => {
    return clientService.delete(input.id);
  });

// Export as route object
export const clientRoutes = {
  list,
  get,
  create,
  update,
  remove,
};
