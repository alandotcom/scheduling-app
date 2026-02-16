import { withOrg } from "../../lib/db.js";
import {
  workflowRepository,
  type WorkflowExecution,
  type WorkflowExecutionEventCreateInput,
  type WorkflowExecutionLog,
  type WorkflowExecutionLogCompleteInput,
  type WorkflowExecutionLogCreateInput,
  type WorkflowWaitState,
  type WorkflowWaitStateCreateInput,
} from "../../repositories/workflows.js";

export class WorkflowRuntimePersistence {
  constructor(private readonly orgId: string) {}

  async appendExecutionEvent(
    input: Omit<WorkflowExecutionEventCreateInput, "executionId"> & {
      executionId: string;
    },
  ): Promise<void> {
    await withOrg(this.orgId, async (tx) => {
      await workflowRepository.createExecutionEvent(tx, this.orgId, {
        ...input,
      });
    });
  }

  async appendExecutionEventOnce(
    input: Omit<WorkflowExecutionEventCreateInput, "executionId"> & {
      executionId: string;
    },
  ): Promise<void> {
    const alreadyExists = await withOrg(this.orgId, async (tx) =>
      workflowRepository.hasExecutionEventType(tx, this.orgId, {
        executionId: input.executionId,
        eventType: input.eventType,
      }),
    );

    if (alreadyExists) {
      return;
    }

    await this.appendExecutionEvent(input);
  }

  async loadExecution(executionId: string): Promise<WorkflowExecution | null> {
    return withOrg(this.orgId, async (tx) =>
      workflowRepository.findExecutionById(tx, this.orgId, executionId),
    );
  }

  async findLatestExecutionLogByNodeId(input: {
    executionId: string;
    nodeId: string;
  }): Promise<WorkflowExecutionLog | null> {
    return withOrg(this.orgId, async (tx) =>
      workflowRepository.findLatestExecutionLogByNodeId(tx, this.orgId, input),
    );
  }

  async createExecutionLog(
    input: WorkflowExecutionLogCreateInput,
  ): Promise<WorkflowExecutionLog> {
    return withOrg(this.orgId, async (tx) =>
      workflowRepository.createExecutionLog(tx, this.orgId, input),
    );
  }

  async completeExecutionLog(
    executionId: string,
    input: WorkflowExecutionLogCompleteInput,
  ): Promise<boolean> {
    return withOrg(this.orgId, async (tx) =>
      workflowRepository.completeExecutionLog(
        tx,
        this.orgId,
        executionId,
        input,
      ),
    );
  }

  async markExecutionErrored(
    executionId: string,
    errorMessage: string,
  ): Promise<void> {
    await withOrg(this.orgId, async (tx) =>
      workflowRepository.markExecutionErrored(
        tx,
        this.orgId,
        executionId,
        errorMessage,
      ),
    );
  }

  async markExecutionSucceeded(
    executionId: string,
    output: unknown,
  ): Promise<void> {
    await withOrg(this.orgId, async (tx) =>
      workflowRepository.markExecutionSucceeded(
        tx,
        this.orgId,
        executionId,
        output,
      ),
    );
  }

  async listExecutionWaitingStates(
    executionId: string,
  ): Promise<WorkflowWaitState[]> {
    return withOrg(this.orgId, async (tx) =>
      workflowRepository.listExecutionWaitingStates(
        tx,
        this.orgId,
        executionId,
      ),
    );
  }

  async createWaitState(
    input: WorkflowWaitStateCreateInput,
  ): Promise<WorkflowWaitState> {
    return withOrg(this.orgId, async (tx) =>
      workflowRepository.createWaitState(tx, this.orgId, input),
    );
  }

  async markExecutionWaiting(executionId: string): Promise<boolean> {
    return withOrg(this.orgId, async (tx) =>
      workflowRepository.markExecutionWaiting(tx, this.orgId, executionId),
    );
  }

  async markExecutionRunning(executionId: string): Promise<boolean> {
    return withOrg(this.orgId, async (tx) =>
      workflowRepository.markExecutionRunning(tx, this.orgId, executionId),
    );
  }

  async markWaitStateResumed(waitStateId: string): Promise<boolean> {
    return withOrg(this.orgId, async (tx) =>
      workflowRepository.markWaitStateResumed(tx, this.orgId, waitStateId),
    );
  }
}
