import { z } from "zod";
import {
  createCustomAttributeDefinitionSchema,
  updateCustomAttributeDefinitionSchema,
  reorderCustomAttributeDefinitionsSchema,
  customAttributeDefinitionResponseSchema,
  slotUsageSchema,
  successResponseSchema,
} from "@scheduling/dto";
import { authed, adminOnly } from "./base.js";
import { clientCustomAttributeService } from "../services/client-custom-attributes.js";

export const listDefinitions = authed
  .route({
    method: "GET",
    path: "/clients/custom-attributes",
    tags: ["Client Custom Attributes"],
    summary: "List client custom attributes",
    description:
      "Returns custom attribute definitions configured for clients in the active organization.",
  })
  .output(z.array(customAttributeDefinitionResponseSchema))
  .handler(async ({ context }) => {
    return clientCustomAttributeService.listDefinitions({
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const createDefinition = adminOnly
  .route({
    method: "POST",
    path: "/clients/custom-attributes",
    successStatus: 201,
    tags: ["Client Custom Attributes"],
    summary: "Create client custom attribute",
    description:
      "Creates a new client custom attribute definition used for client profile fields.",
  })
  .input(createCustomAttributeDefinitionSchema)
  .output(customAttributeDefinitionResponseSchema)
  .handler(async ({ input, context }) => {
    return clientCustomAttributeService.createDefinition(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const updateDefinition = adminOnly
  .route({
    method: "PATCH",
    path: "/clients/custom-attributes/{id}",
    tags: ["Client Custom Attributes"],
    summary: "Update client custom attribute",
    description: "Updates a client custom attribute definition by ID.",
  })
  .input(
    updateCustomAttributeDefinitionSchema.extend({
      id: z.uuid(),
    }),
  )
  .output(customAttributeDefinitionResponseSchema)
  .handler(async ({ input, context }) => {
    const { id, ...data } = input;
    return clientCustomAttributeService.updateDefinition(id, data, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const deleteDefinition = adminOnly
  .route({
    method: "DELETE",
    path: "/clients/custom-attributes/{id}",
    tags: ["Client Custom Attributes"],
    summary: "Delete client custom attribute",
    description: "Deletes a client custom attribute definition by ID.",
  })
  .input(z.object({ id: z.uuid() }))
  .output(successResponseSchema)
  .handler(async ({ input, context }) => {
    return clientCustomAttributeService.deleteDefinition(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const getSlotUsage = authed
  .route({
    method: "GET",
    path: "/clients/custom-attributes/usage",
    tags: ["Client Custom Attributes"],
    summary: "Get custom attribute slot usage",
    description:
      "Returns current and maximum custom-attribute slot usage for the active organization.",
  })
  .output(slotUsageSchema)
  .handler(async ({ context }) => {
    return clientCustomAttributeService.getSlotUsage({
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const reorderDefinitions = adminOnly
  .route({
    method: "PUT",
    path: "/clients/custom-attributes/reorder",
    tags: ["Client Custom Attributes"],
    summary: "Reorder client custom attributes",
    description:
      "Updates display ordering for client custom attribute definitions.",
  })
  .input(reorderCustomAttributeDefinitionsSchema)
  .output(successResponseSchema)
  .handler(async ({ input, context }) => {
    return clientCustomAttributeService.reorderDefinitions(input.orderedIds, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const customAttributeRoutes = {
  listDefinitions,
  createDefinition,
  getSlotUsage,
  updateDefinition,
  deleteDefinition,
  reorderDefinitions,
};
