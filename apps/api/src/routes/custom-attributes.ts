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
  .route({ method: "GET", path: "/clients/custom-attributes" })
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
  .route({ method: "PATCH", path: "/clients/custom-attributes/{id}" })
  .input(
    z.object({
      id: z.uuid(),
      data: updateCustomAttributeDefinitionSchema,
    }),
  )
  .output(customAttributeDefinitionResponseSchema)
  .handler(async ({ input, context }) => {
    return clientCustomAttributeService.updateDefinition(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const deleteDefinition = adminOnly
  .route({ method: "DELETE", path: "/clients/custom-attributes/{id}" })
  .input(z.object({ id: z.uuid() }))
  .output(successResponseSchema)
  .handler(async ({ input, context }) => {
    return clientCustomAttributeService.deleteDefinition(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const getSlotUsage = authed
  .route({ method: "GET", path: "/clients/custom-attributes/usage" })
  .output(slotUsageSchema)
  .handler(async ({ context }) => {
    return clientCustomAttributeService.getSlotUsage({
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const reorderDefinitions = adminOnly
  .route({ method: "PUT", path: "/clients/custom-attributes/reorder" })
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
