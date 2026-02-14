// oRPC routes for workflow CRUD

import { z } from "zod";
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  workflowListResponseSchema,
  workflowResponseSchema,
  successResponseSchema,
} from "@scheduling/dto";
import { authed, adminOnly } from "./base.js";
import { workflowService } from "../services/workflows.js";

const workflowIdInputSchema = z.object({ id: z.uuid() });

// List workflows
export const list = authed
  .route({ method: "GET", path: "/workflows" })
  .output(workflowListResponseSchema)
  .handler(async ({ context }) => {
    return workflowService.list({
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Get a workflow by ID
export const get = authed
  .route({ method: "GET", path: "/workflows/{id}" })
  .input(workflowIdInputSchema)
  .output(workflowResponseSchema)
  .handler(async ({ input, context }) => {
    return workflowService.get(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Create a workflow (admin only)
export const create = adminOnly
  .route({ method: "POST", path: "/workflows", successStatus: 201 })
  .input(createWorkflowSchema)
  .output(workflowResponseSchema)
  .handler(async ({ input, context }) => {
    return workflowService.create(input, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Update a workflow (admin only)
export const update = adminOnly
  .route({ method: "PATCH", path: "/workflows/{id}" })
  .input(
    z.object({
      id: z.uuid(),
      data: updateWorkflowSchema,
    }),
  )
  .output(workflowResponseSchema)
  .handler(async ({ input, context }) => {
    return workflowService.update(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

// Delete a workflow (admin only)
export const remove = adminOnly
  .route({ method: "DELETE", path: "/workflows/{id}" })
  .input(workflowIdInputSchema)
  .output(successResponseSchema)
  .handler(async ({ input, context }) => {
    return workflowService.delete(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const workflowRoutes = {
  list,
  get,
  create,
  update,
  remove,
};
