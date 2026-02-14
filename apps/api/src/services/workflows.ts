// Workflow service - business logic layer for workflow CRUD

import {
  createWorkflowSchema,
  listWorkflowExecutionsQuerySchema,
  saveCurrentWorkflowSchema,
  serializedWorkflowGraphSchema,
  updateWorkflowSchema,
  type ListWorkflowExecutionsQuery,
  type CreateWorkflowInput,
  type SaveCurrentWorkflowInput,
  type WorkflowCurrentResponse,
  type WorkflowExecutionCancelResponse,
  type SerializedWorkflowGraph,
  type UpdateWorkflowInput,
} from "@scheduling/dto";
import { withOrg } from "../lib/db.js";
import { ApplicationError } from "../errors/application-error.js";
import {
  workflowRepository,
  type Workflow,
  type WorkflowExecution,
  type WorkflowExecutionEvent,
  type WorkflowExecutionLog,
} from "../repositories/workflows.js";
import type { ServiceContext } from "./locations.js";
import { sendWorkflowCancelRequested } from "../inngest/runtime-events.js";

const UNIQUE_CONSTRAINT_VIOLATION = "23505";
const WORKFLOW_NAME_UNIQUE_CONSTRAINT = "workflows_org_name_ci_uidx";
const CURRENT_WORKFLOW_NAME = "~~__CURRENT__~~";

function createDefaultCurrentGraph(): SerializedWorkflowGraph {
  const triggerId = crypto.randomUUID();

  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [
      {
        key: triggerId,
        attributes: {
          id: triggerId,
          type: "trigger-node",
          position: {
            x: 0,
            y: 0,
          },
          data: {
            label: "",
            description: "",
            type: "trigger",
            status: "idle",
            config: {
              triggerType: "DomainEvent",
              startEvents: [],
              restartEvents: [],
              stopEvents: [],
            },
          },
        },
      },
    ],
    edges: [],
  };
}

function createEmptyCurrentGraph(): SerializedWorkflowGraph {
  return {
    attributes: {},
    options: {
      type: "directed",
    },
    nodes: [],
    edges: [],
  };
}

function duplicateGraphWithReset(
  graph: SerializedWorkflowGraph,
): SerializedWorkflowGraph {
  const duplicatedGraph = structuredClone(graph);
  const nodeIdMap = new Map<string, string>();

  const duplicatedNodes = duplicatedGraph.nodes.map((sourceNode) => {
    const newId = crypto.randomUUID();
    const duplicatedNode = {
      ...sourceNode,
      key: newId,
      attributes: {
        ...sourceNode.attributes,
        id: newId,
        data: {
          ...sourceNode.attributes.data,
          status: "idle" as const,
        },
      },
    };

    const config = duplicatedNode.attributes.data.config;
    if (config && typeof config === "object" && !Array.isArray(config)) {
      delete (config as Record<string, unknown>)["integrationId"];
    }

    nodeIdMap.set(sourceNode.key, duplicatedNode.key);
    nodeIdMap.set(sourceNode.attributes.id, duplicatedNode.attributes.id);

    return duplicatedNode;
  });

  const duplicatedEdges = duplicatedGraph.edges.map((edge) => {
    const source = nodeIdMap.get(edge.source) ?? edge.source;
    const target = nodeIdMap.get(edge.target) ?? edge.target;
    const newId = crypto.randomUUID();

    return {
      ...edge,
      key: newId,
      source,
      target,
      attributes: {
        ...edge.attributes,
        id: newId,
        source,
        target,
      },
    };
  });

  return {
    attributes: duplicatedGraph.attributes,
    options: duplicatedGraph.options,
    nodes: duplicatedNodes,
    edges: duplicatedEdges,
  };
}

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  if ("code" in error && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
    return true;
  }

  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const { cause } = error;
    if ("errno" in cause && cause.errno === UNIQUE_CONSTRAINT_VIOLATION) {
      return true;
    }
    if ("code" in cause && cause.code === UNIQUE_CONSTRAINT_VIOLATION) {
      return true;
    }
  }

  return false;
}

function getConstraintName(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;

  if ("constraint" in error && typeof error.constraint === "string") {
    return error.constraint;
  }

  if ("cause" in error && error.cause && typeof error.cause === "object") {
    const { cause } = error;
    if ("constraint" in cause && typeof cause.constraint === "string") {
      return cause.constraint;
    }
  }

  return null;
}

function mapWorkflowWriteError(error: unknown): ApplicationError | null {
  if (!isUniqueConstraintViolation(error)) {
    return null;
  }

  const constraint = getConstraintName(error);
  if (constraint === WORKFLOW_NAME_UNIQUE_CONSTRAINT) {
    return new ApplicationError("Workflow name already exists", {
      code: "CONFLICT",
      details: { field: "name" },
    });
  }

  return new ApplicationError("Workflow already exists", {
    code: "CONFLICT",
  });
}

function validateCreateInput(input: CreateWorkflowInput): CreateWorkflowInput {
  const parsed = createWorkflowSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid workflow payload", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

function validateUpdateInput(input: UpdateWorkflowInput): UpdateWorkflowInput {
  const parsed = updateWorkflowSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid workflow payload", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

function validateSaveCurrentInput(
  input: SaveCurrentWorkflowInput,
): SaveCurrentWorkflowInput {
  const parsed = saveCurrentWorkflowSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApplicationError("Invalid workflow payload", {
      code: "BAD_REQUEST",
      details: { issues: parsed.error.issues },
    });
  }

  return parsed.data;
}

function workflowNameConflictError(): ApplicationError {
  return new ApplicationError("Workflow name already exists", {
    code: "CONFLICT",
    details: { field: "name" },
  });
}

export class WorkflowService {
  async list(context: ServiceContext): Promise<Workflow[]> {
    return withOrg(context.orgId, (tx) =>
      workflowRepository.findMany(tx, context.orgId),
    );
  }

  async get(id: string, context: ServiceContext): Promise<Workflow> {
    return withOrg(context.orgId, async (tx) => {
      const workflow = await workflowRepository.findById(tx, context.orgId, id);
      if (!workflow) {
        throw new ApplicationError("Workflow not found", { code: "NOT_FOUND" });
      }

      return workflow;
    });
  }

  async create(
    input: CreateWorkflowInput,
    context: ServiceContext,
  ): Promise<Workflow> {
    const parsed = validateCreateInput(input);

    return withOrg(context.orgId, async (tx) => {
      const existing = await workflowRepository.findByNameInsensitive(
        tx,
        context.orgId,
        parsed.name,
      );

      if (existing) {
        throw workflowNameConflictError();
      }

      try {
        return await workflowRepository.create(tx, context.orgId, {
          name: parsed.name,
          description: parsed.description ?? null,
          graph: parsed.graph,
          visibility: parsed.visibility ?? "private",
        });
      } catch (error: unknown) {
        const mapped = mapWorkflowWriteError(error);
        if (mapped) {
          throw mapped;
        }
        throw error;
      }
    });
  }

  async update(
    id: string,
    input: UpdateWorkflowInput,
    context: ServiceContext,
  ): Promise<Workflow> {
    const parsed = validateUpdateInput(input);

    return withOrg(context.orgId, async (tx) => {
      const existing = await workflowRepository.findById(tx, context.orgId, id);
      if (!existing) {
        throw new ApplicationError("Workflow not found", { code: "NOT_FOUND" });
      }

      if (parsed.name !== undefined) {
        const conflict = await workflowRepository.findByNameInsensitive(
          tx,
          context.orgId,
          parsed.name,
          id,
        );
        if (conflict) {
          throw workflowNameConflictError();
        }
      }

      let updated: Workflow | null;
      try {
        updated = await workflowRepository.update(tx, context.orgId, id, {
          name: parsed.name,
          description: parsed.description,
          graph: parsed.graph,
          visibility: parsed.visibility,
        });
      } catch (error: unknown) {
        const mapped = mapWorkflowWriteError(error);
        if (mapped) {
          throw mapped;
        }
        throw error;
      }

      if (!updated) {
        throw new ApplicationError("Workflow not found", { code: "NOT_FOUND" });
      }

      return updated;
    });
  }

  async delete(
    id: string,
    context: ServiceContext,
  ): Promise<{ success: true }> {
    return withOrg(context.orgId, async (tx) => {
      const existing = await workflowRepository.findById(tx, context.orgId, id);
      if (!existing) {
        throw new ApplicationError("Workflow not found", { code: "NOT_FOUND" });
      }

      await workflowRepository.delete(tx, context.orgId, id);
      return { success: true };
    });
  }

  async getCurrent(context: ServiceContext): Promise<WorkflowCurrentResponse> {
    return withOrg(context.orgId, async (tx) => {
      const workflow = await workflowRepository.findByName(
        tx,
        context.orgId,
        CURRENT_WORKFLOW_NAME,
      );

      if (!workflow) {
        return { graph: createEmptyCurrentGraph() };
      }

      return {
        id: workflow.id,
        graph: workflow.graph,
      };
    });
  }

  async saveCurrent(
    input: SaveCurrentWorkflowInput,
    context: ServiceContext,
  ): Promise<WorkflowCurrentResponse> {
    const parsed = validateSaveCurrentInput(input);
    const graph =
      parsed.graph.nodes.length === 0
        ? createDefaultCurrentGraph()
        : parsed.graph;

    return withOrg(context.orgId, async (tx) => {
      const existing = await workflowRepository.findByName(
        tx,
        context.orgId,
        CURRENT_WORKFLOW_NAME,
      );

      if (existing) {
        const updated = await workflowRepository.update(
          tx,
          context.orgId,
          existing.id,
          {
            graph,
          },
        );

        if (!updated) {
          throw new ApplicationError("Workflow not found", {
            code: "NOT_FOUND",
          });
        }

        return {
          id: updated.id,
          graph: updated.graph,
        };
      }

      const created = await workflowRepository.create(tx, context.orgId, {
        name: CURRENT_WORKFLOW_NAME,
        description: "Auto-saved current workflow",
        graph,
        visibility: "private",
      });

      return {
        id: created.id,
        graph: created.graph,
      };
    });
  }

  async duplicate(id: string, context: ServiceContext): Promise<Workflow> {
    return withOrg(context.orgId, async (tx) => {
      const source = await workflowRepository.findById(tx, context.orgId, id);
      if (!source) {
        throw new ApplicationError("Workflow not found", { code: "NOT_FOUND" });
      }

      const name = `${source.name} (Copy)`;
      const conflict = await workflowRepository.findByNameInsensitive(
        tx,
        context.orgId,
        name,
      );
      if (conflict) {
        throw workflowNameConflictError();
      }

      const graph = serializedWorkflowGraphSchema.parse(
        duplicateGraphWithReset(source.graph),
      );

      try {
        return await workflowRepository.create(tx, context.orgId, {
          name,
          description: source.description,
          graph,
          visibility: "private",
        });
      } catch (error: unknown) {
        const mapped = mapWorkflowWriteError(error);
        if (mapped) {
          throw mapped;
        }
        throw error;
      }
    });
  }

  async listExecutions(
    workflowId: string,
    query: ListWorkflowExecutionsQuery,
    context: ServiceContext,
  ): Promise<WorkflowExecution[]> {
    const parsed = listWorkflowExecutionsQuerySchema.parse(query);

    return withOrg(context.orgId, async (tx) => {
      const workflow = await workflowRepository.findById(
        tx,
        context.orgId,
        workflowId,
      );
      if (!workflow) {
        throw new ApplicationError("Workflow not found", { code: "NOT_FOUND" });
      }

      const executions = await workflowRepository.listExecutionsByWorkflow(
        tx,
        context.orgId,
        workflowId,
        parsed.limit,
      );

      return executions;
    });
  }

  async getExecution(
    executionId: string,
    context: ServiceContext,
  ): Promise<WorkflowExecution> {
    return withOrg(context.orgId, async (tx) => {
      const execution = await workflowRepository.findExecutionById(
        tx,
        context.orgId,
        executionId,
      );

      if (!execution) {
        throw new ApplicationError("Execution not found", {
          code: "NOT_FOUND",
        });
      }

      return execution;
    });
  }

  async getExecutionLogs(
    executionId: string,
    context: ServiceContext,
  ): Promise<{ execution: WorkflowExecution; logs: WorkflowExecutionLog[] }> {
    return withOrg(context.orgId, async (tx) => {
      const execution = await workflowRepository.findExecutionById(
        tx,
        context.orgId,
        executionId,
      );

      if (!execution) {
        throw new ApplicationError("Execution not found", {
          code: "NOT_FOUND",
        });
      }

      const logs = await workflowRepository.listExecutionLogs(
        tx,
        context.orgId,
        executionId,
      );

      return { execution, logs };
    });
  }

  async getExecutionEvents(
    executionId: string,
    context: ServiceContext,
  ): Promise<{ events: WorkflowExecutionEvent[] }> {
    return withOrg(context.orgId, async (tx) => {
      const execution = await workflowRepository.findExecutionById(
        tx,
        context.orgId,
        executionId,
      );

      if (!execution) {
        throw new ApplicationError("Execution not found", {
          code: "NOT_FOUND",
        });
      }

      const events = await workflowRepository.listExecutionEvents(
        tx,
        context.orgId,
        executionId,
      );

      return { events };
    });
  }

  async getExecutionStatus(
    executionId: string,
    context: ServiceContext,
  ): Promise<{
    status: string;
    nodeStatuses: Array<{ nodeId: string; status: string }>;
  }> {
    return withOrg(context.orgId, async (tx) => {
      const execution = await workflowRepository.findExecutionById(
        tx,
        context.orgId,
        executionId,
      );

      if (!execution) {
        throw new ApplicationError("Execution not found", {
          code: "NOT_FOUND",
        });
      }

      const logs = await workflowRepository.listExecutionLogs(
        tx,
        context.orgId,
        executionId,
      );

      const nodeStatuses = Array.from(
        logs.reduce((latestByNode, log) => {
          if (latestByNode.has(log.nodeId)) {
            return latestByNode;
          }

          latestByNode.set(log.nodeId, {
            nodeId: log.nodeId,
            status:
              execution.status === "cancelled" &&
              (log.status === "pending" || log.status === "running")
                ? "cancelled"
                : log.status,
          });

          return latestByNode;
        }, new Map<string, { nodeId: string; status: string }>()),
      ).map(([, nodeStatus]) => nodeStatus);

      return {
        status: execution.status,
        nodeStatuses,
      };
    });
  }

  async cancelExecution(
    executionId: string,
    context: ServiceContext,
  ): Promise<WorkflowExecutionCancelResponse> {
    return withOrg(context.orgId, async (tx) => {
      const execution = await workflowRepository.findExecutionById(
        tx,
        context.orgId,
        executionId,
      );

      if (!execution) {
        throw new ApplicationError("Execution not found", {
          code: "NOT_FOUND",
        });
      }

      const waitingStates = await workflowRepository.listExecutionWaitingStates(
        tx,
        context.orgId,
        executionId,
      );

      if (waitingStates.length === 0) {
        throw new ApplicationError("Execution is not currently waiting", {
          code: "CONFLICT",
        });
      }

      await sendWorkflowCancelRequested({
        executionId,
        workflowId: execution.workflowId,
        reason: "Cancelled manually",
        requestedBy: context.userId,
      });

      const cancelledWaitStateIds =
        await workflowRepository.markWaitingStatesCancelled(
          tx,
          context.orgId,
          waitingStates.map((state) => state.id),
        );

      if (cancelledWaitStateIds.length === 0) {
        throw new ApplicationError("Execution is no longer waiting", {
          code: "CONFLICT",
        });
      }

      await workflowRepository.markExecutionCancelled(
        tx,
        context.orgId,
        executionId,
        "Cancelled manually",
      );

      return {
        success: true,
        status: "cancelled",
        cancelledWaitStates: cancelledWaitStateIds.length,
      };
    });
  }
}

export const workflowService = new WorkflowService();
