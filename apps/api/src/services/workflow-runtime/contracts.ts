import type { DomainEventType, SerializedWorkflowGraph } from "@scheduling/dto";

export type WorkflowRunRequestedInput = {
  orgId: string;
  workflowId: string;
  workflowName: string;
  executionId: string;
  graph: SerializedWorkflowGraph;
  triggerInput: Record<string, unknown>;
  eventContext: {
    eventType: DomainEventType;
    correlationKey?: string;
  };
};

export type WorkflowRunRequestedRuntime = {
  runStep: (
    stepId: string,
    fn: () => Promise<Record<string, unknown>>,
  ) => Promise<Record<string, unknown>>;
  sleep: (stepId: string, delayMs: number) => Promise<void>;
};
