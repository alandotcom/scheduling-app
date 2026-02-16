// Workflow repository - data access layer for workflow CRUD

import { and, desc, eq, ilike, inArray, ne, sql, type SQL } from "drizzle-orm";
import {
  workflowExecutionEvents,
  workflowExecutionLogs,
  workflowExecutions,
  workflows,
  workflowWaitStates,
} from "@scheduling/db/schema";
import {
  serializedWorkflowGraphSchema,
  workflowVisibilitySchema,
} from "@scheduling/dto";
import type {
  SerializedWorkflowGraph,
  WorkflowVisibility,
} from "@scheduling/dto";
import type { DbClient } from "../lib/db.js";
import { setOrgContext } from "./base.js";

type WorkflowRow = typeof workflows.$inferSelect;

export type Workflow = Omit<WorkflowRow, "graph" | "visibility"> & {
  graph: SerializedWorkflowGraph;
  visibility: WorkflowVisibility;
};

export interface WorkflowCreateInput {
  name: string;
  description?: string | null | undefined;
  graph: SerializedWorkflowGraph;
  isEnabled?: boolean | undefined;
  visibility?: WorkflowVisibility | undefined;
}

export interface WorkflowUpdateInput {
  name?: string | undefined;
  description?: string | null | undefined;
  graph?: SerializedWorkflowGraph | undefined;
  isEnabled?: boolean | undefined;
  visibility?: WorkflowVisibility | undefined;
}

type WorkflowExecutionRow = typeof workflowExecutions.$inferSelect;
type WorkflowExecutionLogRow = typeof workflowExecutionLogs.$inferSelect;
type WorkflowExecutionEventRow = typeof workflowExecutionEvents.$inferSelect;
type WorkflowWaitStateRow = typeof workflowWaitStates.$inferSelect;

export type WorkflowExecution = WorkflowExecutionRow;
export type WorkflowExecutionLog = WorkflowExecutionLogRow;
export type WorkflowExecutionEvent = WorkflowExecutionEventRow;
export type WorkflowWaitState = WorkflowWaitStateRow;

export interface WorkflowExecutionCreateInput {
  workflowId: string;
  status: string;
  triggerType?: string | null;
  isDryRun?: boolean;
  triggerEventType?: string | null;
  triggerEventId?: string | null;
  correlationKey?: string | null;
  input?: Record<string, unknown>;
}

export interface WorkflowExecutionLogCreateInput {
  executionId: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: "pending" | "running" | "success" | "error" | "cancelled";
  input?: unknown;
  startedAt?: Date;
  timestamp?: Date;
}

export interface WorkflowExecutionLogCompleteInput {
  logId: string;
  status: "pending" | "running" | "success" | "error" | "cancelled";
  output?: unknown;
  error?: string | null;
  completedAt?: Date;
  duration?: string | null;
  timestamp?: Date;
}

export interface WorkflowExecutionEventCreateInput {
  workflowId: string;
  executionId?: string | null;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

export interface WorkflowWaitStateCreateInput {
  executionId: string;
  workflowId: string;
  runId: string;
  nodeId: string;
  nodeName: string;
  waitType: string;
  status: string;
  hookToken?: string | null;
  waitUntil?: Date | null;
  correlationKey?: string | null;
  metadata?: Record<string, unknown>;
}

function toWorkflow(row: WorkflowRow): Workflow {
  const graph = serializedWorkflowGraphSchema.parse(row.graph);
  const visibility = workflowVisibilitySchema.parse(row.visibility);

  return {
    ...row,
    graph,
    visibility,
  };
}

export class WorkflowRepository {
  async findMany(tx: DbClient, orgId: string): Promise<Workflow[]> {
    await setOrgContext(tx, orgId);
    const rows = await tx
      .select()
      .from(workflows)
      .where(ne(workflows.name, "~~__CURRENT__~~"))
      .orderBy(desc(workflows.updatedAt), desc(workflows.id));
    return rows.map(toWorkflow);
  }

  async findById(
    tx: DbClient,
    orgId: string,
    id: string,
  ): Promise<Workflow | null> {
    await setOrgContext(tx, orgId);
    const [row] = await tx
      .select()
      .from(workflows)
      .where(eq(workflows.id, id))
      .limit(1);

    if (!row) {
      return null;
    }

    return toWorkflow(row);
  }

  async findByNameInsensitive(
    tx: DbClient,
    orgId: string,
    name: string,
    excludeId?: string,
  ): Promise<Workflow | null> {
    await setOrgContext(tx, orgId);

    const filters: SQL[] = [sql`lower(${workflows.name}) = lower(${name})`];

    if (excludeId) {
      filters.push(ne(workflows.id, excludeId));
    }

    const whereClause = filters.length > 1 ? and(...filters) : filters[0];
    const [row] = await tx.select().from(workflows).where(whereClause).limit(1);

    if (!row) {
      return null;
    }

    return toWorkflow(row);
  }

  async findNamesByPrefix(
    tx: DbClient,
    orgId: string,
    prefix: string,
  ): Promise<string[]> {
    await setOrgContext(tx, orgId);

    const rows = await tx
      .select({ name: workflows.name })
      .from(workflows)
      .where(ilike(workflows.name, `${prefix}%`));

    return rows.map((row) => row.name);
  }

  async create(
    tx: DbClient,
    orgId: string,
    input: WorkflowCreateInput,
  ): Promise<Workflow> {
    await setOrgContext(tx, orgId);
    const [row] = await tx
      .insert(workflows)
      .values({
        orgId,
        name: input.name,
        description: input.description ?? null,
        graph: input.graph as Record<string, unknown>,
        isEnabled: input.isEnabled ?? false,
        visibility: input.visibility ?? "private",
      })
      .returning();

    return toWorkflow(row!);
  }

  async update(
    tx: DbClient,
    orgId: string,
    id: string,
    input: WorkflowUpdateInput,
  ): Promise<Workflow | null> {
    await setOrgContext(tx, orgId);

    const [row] = await tx
      .update(workflows)
      .set({
        ...input,
        graph: input.graph
          ? (input.graph as Record<string, unknown>)
          : undefined,
        updatedAt: sql`now()`,
      })
      .where(eq(workflows.id, id))
      .returning();

    if (!row) {
      return null;
    }

    return toWorkflow(row);
  }

  async delete(tx: DbClient, orgId: string, id: string): Promise<boolean> {
    await setOrgContext(tx, orgId);
    const deleted = await tx
      .delete(workflows)
      .where(eq(workflows.id, id))
      .returning({ id: workflows.id });

    return deleted.length > 0;
  }

  async createExecution(
    tx: DbClient,
    orgId: string,
    input: WorkflowExecutionCreateInput,
  ): Promise<WorkflowExecution> {
    await setOrgContext(tx, orgId);

    const [row] = await tx
      .insert(workflowExecutions)
      .values({
        orgId,
        workflowId: input.workflowId,
        status: input.status,
        triggerType: input.triggerType ?? null,
        isDryRun: input.isDryRun ?? false,
        triggerEventType: input.triggerEventType ?? null,
        triggerEventId: input.triggerEventId ?? null,
        correlationKey: input.correlationKey ?? null,
        input: input.input,
      })
      .returning();

    return row!;
  }

  async listExecutionsByWorkflow(
    tx: DbClient,
    orgId: string,
    workflowId: string,
    limit: number,
  ): Promise<WorkflowExecution[]> {
    await setOrgContext(tx, orgId);

    return await tx
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.workflowId, workflowId))
      .orderBy(desc(workflowExecutions.startedAt), desc(workflowExecutions.id))
      .limit(limit);
  }

  async findExecutionById(
    tx: DbClient,
    orgId: string,
    executionId: string,
  ): Promise<WorkflowExecution | null> {
    await setOrgContext(tx, orgId);

    const [execution] = await tx
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, executionId))
      .limit(1);

    return execution ?? null;
  }

  async listExecutionLogs(
    tx: DbClient,
    orgId: string,
    executionId: string,
  ): Promise<WorkflowExecutionLog[]> {
    await setOrgContext(tx, orgId);

    return await tx
      .select()
      .from(workflowExecutionLogs)
      .where(eq(workflowExecutionLogs.executionId, executionId))
      .orderBy(
        desc(workflowExecutionLogs.timestamp),
        desc(workflowExecutionLogs.id),
      );
  }

  async findLatestExecutionLogByNodeId(
    tx: DbClient,
    orgId: string,
    input: {
      executionId: string;
      nodeId: string;
    },
  ): Promise<WorkflowExecutionLog | null> {
    await setOrgContext(tx, orgId);

    const [row] = await tx
      .select()
      .from(workflowExecutionLogs)
      .where(
        and(
          eq(workflowExecutionLogs.executionId, input.executionId),
          eq(workflowExecutionLogs.nodeId, input.nodeId),
        ),
      )
      .orderBy(
        desc(workflowExecutionLogs.timestamp),
        desc(workflowExecutionLogs.id),
      )
      .limit(1);

    return row ?? null;
  }

  async createExecutionLog(
    tx: DbClient,
    orgId: string,
    input: WorkflowExecutionLogCreateInput,
  ): Promise<WorkflowExecutionLog> {
    await setOrgContext(tx, orgId);

    const [row] = await tx
      .insert(workflowExecutionLogs)
      .values({
        orgId,
        executionId: input.executionId,
        nodeId: input.nodeId,
        nodeName: input.nodeName,
        nodeType: input.nodeType,
        status: input.status,
        input: input.input,
        ...(input.startedAt ? { startedAt: input.startedAt } : {}),
        ...(input.timestamp ? { timestamp: input.timestamp } : {}),
      })
      .returning();

    return row!;
  }

  async completeExecutionLog(
    tx: DbClient,
    orgId: string,
    executionId: string,
    input: WorkflowExecutionLogCompleteInput,
  ): Promise<boolean> {
    await setOrgContext(tx, orgId);

    const updated = await tx
      .update(workflowExecutionLogs)
      .set({
        status: input.status,
        output: input.output,
        error: input.error,
        completedAt: input.completedAt ?? sql`now()`,
        duration: input.duration,
        timestamp: input.timestamp ?? sql`now()`,
      })
      .where(
        and(
          eq(workflowExecutionLogs.id, input.logId),
          eq(workflowExecutionLogs.executionId, executionId),
        ),
      )
      .returning({ id: workflowExecutionLogs.id });

    return updated.length > 0;
  }

  async listExecutionEvents(
    tx: DbClient,
    orgId: string,
    executionId: string,
  ): Promise<WorkflowExecutionEvent[]> {
    await setOrgContext(tx, orgId);

    return await tx
      .select()
      .from(workflowExecutionEvents)
      .where(eq(workflowExecutionEvents.executionId, executionId))
      .orderBy(
        desc(workflowExecutionEvents.createdAt),
        desc(workflowExecutionEvents.id),
      )
      .limit(200);
  }

  async createExecutionEvent(
    tx: DbClient,
    orgId: string,
    input: WorkflowExecutionEventCreateInput,
  ): Promise<WorkflowExecutionEvent> {
    await setOrgContext(tx, orgId);

    const [row] = await tx
      .insert(workflowExecutionEvents)
      .values({
        orgId,
        workflowId: input.workflowId,
        executionId: input.executionId ?? null,
        eventType: input.eventType,
        message: input.message,
        metadata: input.metadata,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      })
      .returning();

    return row!;
  }

  async hasExecutionEventType(
    tx: DbClient,
    orgId: string,
    input: {
      executionId: string;
      eventType: string;
    },
  ): Promise<boolean> {
    await setOrgContext(tx, orgId);

    const [row] = await tx
      .select({ id: workflowExecutionEvents.id })
      .from(workflowExecutionEvents)
      .where(
        and(
          eq(workflowExecutionEvents.executionId, input.executionId),
          eq(workflowExecutionEvents.eventType, input.eventType),
        ),
      )
      .limit(1);

    return row !== undefined;
  }

  async listExecutionWaitingStates(
    tx: DbClient,
    orgId: string,
    executionId: string,
  ): Promise<WorkflowWaitState[]> {
    await setOrgContext(tx, orgId);

    return await tx
      .select()
      .from(workflowWaitStates)
      .where(
        and(
          eq(workflowWaitStates.executionId, executionId),
          eq(workflowWaitStates.status, "waiting"),
        ),
      )
      .orderBy(desc(workflowWaitStates.createdAt), desc(workflowWaitStates.id));
  }

  async createWaitState(
    tx: DbClient,
    orgId: string,
    input: WorkflowWaitStateCreateInput,
  ): Promise<WorkflowWaitState> {
    await setOrgContext(tx, orgId);

    const [row] = await tx
      .insert(workflowWaitStates)
      .values({
        orgId,
        executionId: input.executionId,
        workflowId: input.workflowId,
        runId: input.runId,
        nodeId: input.nodeId,
        nodeName: input.nodeName,
        waitType: input.waitType,
        status: input.status,
        hookToken: input.hookToken ?? null,
        waitUntil: input.waitUntil ?? null,
        correlationKey: input.correlationKey ?? null,
        metadata: input.metadata,
      })
      .returning();

    return row!;
  }

  async setExecutionRunId(
    tx: DbClient,
    orgId: string,
    executionId: string,
    workflowRunId: string | null,
  ): Promise<void> {
    await setOrgContext(tx, orgId);

    await tx
      .update(workflowExecutions)
      .set({ workflowRunId })
      .where(eq(workflowExecutions.id, executionId));
  }

  async markExecutionErrored(
    tx: DbClient,
    orgId: string,
    executionId: string,
    errorMessage: string,
  ): Promise<void> {
    await setOrgContext(tx, orgId);

    await tx
      .update(workflowExecutions)
      .set({
        status: "error",
        error: errorMessage,
        completedAt: sql`now()`,
      })
      .where(
        and(
          eq(workflowExecutions.id, executionId),
          ne(workflowExecutions.status, "cancelled"),
        ),
      );
  }

  async markExecutionSucceeded(
    tx: DbClient,
    orgId: string,
    executionId: string,
    output: unknown,
  ): Promise<void> {
    await setOrgContext(tx, orgId);

    await tx
      .update(workflowExecutions)
      .set({
        status: "success",
        output,
        completedAt: sql`now()`,
      })
      .where(
        and(
          eq(workflowExecutions.id, executionId),
          ne(workflowExecutions.status, "cancelled"),
        ),
      );
  }

  async markExecutionWaiting(
    tx: DbClient,
    orgId: string,
    executionId: string,
  ): Promise<boolean> {
    await setOrgContext(tx, orgId);

    const updated = await tx
      .update(workflowExecutions)
      .set({
        status: "waiting",
        waitingAt: sql`now()`,
      })
      .where(
        and(
          eq(workflowExecutions.id, executionId),
          eq(workflowExecutions.status, "running"),
        ),
      )
      .returning({ id: workflowExecutions.id });

    return updated.length > 0;
  }

  async listWorkflowWaitingStatesByCorrelation(
    tx: DbClient,
    orgId: string,
    input: {
      workflowId: string;
      correlationKey: string;
    },
  ): Promise<WorkflowWaitState[]> {
    await setOrgContext(tx, orgId);

    return await tx
      .select()
      .from(workflowWaitStates)
      .where(
        and(
          eq(workflowWaitStates.workflowId, input.workflowId),
          eq(workflowWaitStates.correlationKey, input.correlationKey),
          eq(workflowWaitStates.status, "waiting"),
        ),
      );
  }

  async markWaitingStatesCancelled(
    tx: DbClient,
    orgId: string,
    waitStateIds: string[],
  ): Promise<string[]> {
    if (waitStateIds.length === 0) {
      return [];
    }

    await setOrgContext(tx, orgId);

    const updated = await tx
      .update(workflowWaitStates)
      .set({
        status: "cancelled",
        cancelledAt: sql`now()`,
      })
      .where(
        and(
          inArray(workflowWaitStates.id, waitStateIds),
          eq(workflowWaitStates.status, "waiting"),
        ),
      )
      .returning({ id: workflowWaitStates.id });

    return updated.map((row) => row.id);
  }

  async markExecutionCancelled(
    tx: DbClient,
    orgId: string,
    executionId: string,
    reason: string,
  ): Promise<void> {
    await setOrgContext(tx, orgId);

    await tx
      .update(workflowExecutions)
      .set({
        status: "cancelled",
        waitingAt: null,
        cancelledAt: sql`now()`,
        completedAt: sql`now()`,
        error: reason,
      })
      .where(eq(workflowExecutions.id, executionId));
  }

  async markExecutionRunning(
    tx: DbClient,
    orgId: string,
    executionId: string,
  ): Promise<boolean> {
    await setOrgContext(tx, orgId);

    const updated = await tx
      .update(workflowExecutions)
      .set({
        status: "running",
        waitingAt: null,
      })
      .where(
        and(
          eq(workflowExecutions.id, executionId),
          eq(workflowExecutions.status, "waiting"),
        ),
      )
      .returning({ id: workflowExecutions.id });

    return updated.length > 0;
  }

  async markWaitStateResumed(
    tx: DbClient,
    orgId: string,
    waitStateId: string,
  ): Promise<boolean> {
    await setOrgContext(tx, orgId);

    const updated = await tx
      .update(workflowWaitStates)
      .set({
        status: "resumed",
        resumedAt: sql`now()`,
      })
      .where(
        and(
          eq(workflowWaitStates.id, waitStateId),
          eq(workflowWaitStates.status, "waiting"),
        ),
      )
      .returning({ id: workflowWaitStates.id });

    return updated.length > 0;
  }
}

export const workflowRepository = new WorkflowRepository();
