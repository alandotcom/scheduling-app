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

const referenceIdParamSchema = z.object({
  referenceId: z.string().trim().min(1),
});

// List clients with cursor pagination and optional search
export const list = authed
  .route({
    method: "GET",
    path: "/clients",
    tags: ["Clients"],
    summary: "List clients",
    description:
      "Returns paginated clients for the active organization with optional search.",
  })
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
  .route({
    method: "GET",
    path: "/clients/{id}",
    tags: ["Clients"],
    summary: "Get client",
    description: "Returns a single client by ID.",
  })
  .input(z.object({ id: z.uuid() }))
  .output(clientResponseSchema)
  .handler(async ({ input, context }) => {
    return clientService.get(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Get single client by reference ID
export const getByReference = authed
  .route({
    method: "GET",
    path: "/clients/by-reference/{referenceId}",
    tags: ["Clients"],
    summary: "Get client by reference",
    description:
      "Returns a single client using the external/by-reference identifier path.",
  })
  .input(referenceIdParamSchema)
  .output(clientResponseSchema)
  .handler(async ({ input, context }) => {
    return clientService.getByReferenceId(input.referenceId, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Create client
export const create = authed
  .route({
    method: "POST",
    path: "/clients",
    successStatus: 201,
    tags: ["Clients"],
    summary: "Create client",
    description: "Creates a new client record for the active organization.",
  })
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
  .route({
    method: "PATCH",
    path: "/clients/{id}",
    tags: ["Clients"],
    summary: "Update client",
    description: "Updates an existing client by ID.",
  })
  .input(
    updateClientSchema.extend({
      id: z.uuid(),
    }),
  )
  .output(clientResponseSchema)
  .handler(async ({ input, context }) => {
    const { id, ...data } = input;
    return clientService.update(id, data, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Update client by reference ID
export const updateByReference = authed
  .route({
    method: "PATCH",
    path: "/clients/by-reference/{clientReferenceId}",
    tags: ["Clients"],
    summary: "Update client by reference",
    description:
      "Updates a client using the external/by-reference identifier path.",
  })
  .input(
    updateClientSchema.extend({
      clientReferenceId: z.string().trim().min(1),
    }),
  )
  .output(clientResponseSchema)
  .handler(async ({ input, context }) => {
    const { clientReferenceId, ...data } = input;
    return clientService.updateByReferenceId(clientReferenceId, data, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Delete client
export const remove = authed
  .route({
    method: "DELETE",
    path: "/clients/{id}",
    tags: ["Clients"],
    summary: "Delete client",
    description: "Deletes a client by ID.",
  })
  .input(z.object({ id: z.uuid() }))
  .output(successResponseSchema)
  .handler(async ({ input, context }) => {
    return clientService.delete(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Delete client by reference ID
export const removeByReference = authed
  .route({
    method: "DELETE",
    path: "/clients/by-reference/{referenceId}",
    tags: ["Clients"],
    summary: "Delete client by reference",
    description:
      "Deletes a client using the external/by-reference identifier path.",
  })
  .input(referenceIdParamSchema)
  .output(successResponseSchema)
  .handler(async ({ input, context }) => {
    return clientService.deleteByReferenceId(input.referenceId, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Client history summary
export const historySummary = authed
  .route({
    method: "GET",
    path: "/clients/{id}/history-summary",
    tags: ["Clients"],
    summary: "Get client history summary",
    description: "Returns appointment and status history for a client by ID.",
  })
  .input(z.object({ id: z.uuid() }))
  .output(clientHistorySummarySchema)
  .handler(async ({ input, context }) => {
    const result = await clientService.historySummary(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
    return clientHistorySummarySchema.parse(result);
  });

// Client history summary by reference ID
export const historySummaryByReference = authed
  .route({
    method: "GET",
    path: "/clients/by-reference/{referenceId}/history-summary",
    tags: ["Clients"],
    summary: "Get client history summary by reference",
    description:
      "Returns appointment and status history for a client using a by-reference ID.",
  })
  .input(referenceIdParamSchema)
  .output(clientHistorySummarySchema)
  .handler(async ({ input, context }) => {
    const result = await clientService.historySummaryByReferenceId(
      input.referenceId,
      {
        orgId: context.orgId,
        userId: context.userId,
      },
    );
    return clientHistorySummarySchema.parse(result);
  });

// Export as route object
export const clientRoutes = {
  list,
  get,
  getByReference,
  create,
  update,
  updateByReference,
  remove,
  removeByReference,
  historySummary,
  historySummaryByReference,
};
