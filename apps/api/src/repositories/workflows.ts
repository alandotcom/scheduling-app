// Workflow repository - data access layer for workflow CRUD

import { and, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import {
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
  visibility?: WorkflowVisibility | undefined;
}

export interface WorkflowUpdateInput {
  name?: string | undefined;
  description?: string | null | undefined;
  graph?: SerializedWorkflowGraph | undefined;
  visibility?: WorkflowVisibility | undefined;
}

type WorkflowExecutionRow = typeof workflowExecutions.$inferSelect;
type WorkflowWaitStateRow = typeof workflowWaitStates.$inferSelect;

export type WorkflowExecution = WorkflowExecutionRow;
export type WorkflowWaitState = WorkflowWaitStateRow;

export interface WorkflowExecutionCreateInput {
  workflowId: string;
  status: string;
  triggerType?: string | null;
  isDryRun?: boolean;
  triggerEventType?: string | null;
  correlationKey?: string | null;
  input?: Record<string, unknown>;
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
        correlationKey: input.correlationKey ?? null,
        input: input.input,
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
      .where(eq(workflowExecutions.id, executionId));
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
