// oRPC routes for workflow CRUD

import { z } from "zod";
import {
  createWorkflowSchema,
  listWorkflowExecutionsQuerySchema,
  updateWorkflowSchema,
  workflowExecutionCancelResponseSchema,
  workflowExecutionEventsResponseSchema,
  workflowExecutionListResponseSchema,
  workflowExecutionLogsResponseSchema,
  workflowExecutionSchema,
  workflowExecutionStatusResponseSchema,
  workflowListResponseSchema,
  workflowResponseSchema,
  successResponseSchema,
} from "@scheduling/dto";
import { authed, adminOnly } from "./base.js";
import { workflowService } from "../services/workflows.js";

const workflowIdInputSchema = z.object({ id: z.uuid() });
const executionIdInputSchema = z.object({ executionId: z.uuid() });

function withOwnership<T extends Record<string, unknown>>(
  value: T,
  role: "owner" | "admin" | "member" | null,
): T & { isOwner: boolean } {
  return {
    ...value,
    isOwner: role !== "member",
  };
}

// List workflows
export const list = authed
  .route({ method: "GET", path: "/workflows" })
  .output(workflowListResponseSchema)
  .handler(async ({ context }) => {
    const workflows = await workflowService.list({
      orgId: context.orgId,
      userId: context.userId,
    });

    return workflows.map((workflow) => withOwnership(workflow, context.role));
  });

// Get a workflow by ID
export const get = authed
  .route({ method: "GET", path: "/workflows/{id}" })
  .input(workflowIdInputSchema)
  .output(workflowResponseSchema)
  .handler(async ({ input, context }) => {
    const workflow = await workflowService.get(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });

    return withOwnership(workflow, context.role);
  });

// Create a workflow (admin only)
export const create = adminOnly
  .route({ method: "POST", path: "/workflows", successStatus: 201 })
  .input(createWorkflowSchema)
  .output(workflowResponseSchema)
  .handler(async ({ input, context }) => {
    const workflow = await workflowService.create(input, {
      orgId: context.orgId,
      userId: context.userId,
    });

    return withOwnership(workflow, context.role);
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
    const workflow = await workflowService.update(input.id, input.data, {
      orgId: context.orgId,
      userId: context.userId,
    });

    return withOwnership(workflow, context.role);
  });

// Duplicate workflow (admin only)
export const duplicate = adminOnly
  .route({
    method: "POST",
    path: "/workflows/{id}/duplicate",
    successStatus: 201,
  })
  .input(workflowIdInputSchema)
  .output(workflowResponseSchema)
  .handler(async ({ input, context }) => {
    const workflow = await workflowService.duplicate(input.id, {
      orgId: context.orgId,
      userId: context.userId,
    });

    return withOwnership(workflow, context.role);
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

// List workflow executions (read-only for authenticated users)
export const listExecutions = authed
  .route({ method: "GET", path: "/workflows/{id}/executions" })
  .input(
    workflowIdInputSchema.extend({
      limit: listWorkflowExecutionsQuerySchema.shape.limit.optional(),
    }),
  )
  .output(workflowExecutionListResponseSchema)
  .handler(async ({ input, context }) => {
    const executions = await workflowService.listExecutions(
      input.id,
      { limit: input.limit ?? 50 },
      {
        orgId: context.orgId,
        userId: context.userId,
      },
    );

    return workflowExecutionListResponseSchema.parse(executions);
  });

// Get execution details
export const getExecution = authed
  .route({ method: "GET", path: "/workflows/executions/{executionId}" })
  .input(executionIdInputSchema)
  .output(workflowExecutionSchema)
  .handler(async ({ input, context }) => {
    const execution = await workflowService.getExecution(input.executionId, {
      orgId: context.orgId,
      userId: context.userId,
    });

    return workflowExecutionSchema.parse(execution);
  });

// Get execution logs and execution summary
export const getExecutionLogs = authed
  .route({ method: "GET", path: "/workflows/executions/{executionId}/logs" })
  .input(executionIdInputSchema)
  .output(workflowExecutionLogsResponseSchema)
  .handler(async ({ input, context }) => {
    const logs = await workflowService.getExecutionLogs(input.executionId, {
      orgId: context.orgId,
      userId: context.userId,
    });

    return workflowExecutionLogsResponseSchema.parse(logs);
  });

// Get execution events timeline
export const getExecutionEvents = authed
  .route({
    method: "GET",
    path: "/workflows/executions/{executionId}/events",
  })
  .input(executionIdInputSchema)
  .output(workflowExecutionEventsResponseSchema)
  .handler(async ({ input, context }) => {
    const events = await workflowService.getExecutionEvents(input.executionId, {
      orgId: context.orgId,
      userId: context.userId,
    });

    return workflowExecutionEventsResponseSchema.parse(events);
  });

// Get current execution status and per-node statuses
export const getExecutionStatus = authed
  .route({
    method: "GET",
    path: "/workflows/executions/{executionId}/status",
  })
  .input(executionIdInputSchema)
  .output(workflowExecutionStatusResponseSchema)
  .handler(async ({ input, context }) => {
    const status = await workflowService.getExecutionStatus(input.executionId, {
      orgId: context.orgId,
      userId: context.userId,
    });

    return workflowExecutionStatusResponseSchema.parse(status);
  });

// Cancel execution (admin only)
export const cancelExecution = adminOnly
  .route({
    method: "POST",
    path: "/workflows/executions/{executionId}/cancel",
  })
  .input(executionIdInputSchema)
  .output(workflowExecutionCancelResponseSchema)
  .handler(async ({ input, context }) => {
    return workflowService.cancelExecution(input.executionId, {
      orgId: context.orgId,
      userId: context.userId,
    });
  });

export const executions = {
  list: listExecutions,
  get: getExecution,
  logs: getExecutionLogs,
  events: getExecutionEvents,
  status: getExecutionStatus,
  cancel: cancelExecution,
};

export const workflowRoutes = {
  list,
  get,
  create,
  update,
  duplicate,
  remove,
  listExecutions,
  getExecution,
  getExecutionLogs,
  getExecutionEvents,
  getExecutionStatus,
  cancelExecution,
  executions,
};
