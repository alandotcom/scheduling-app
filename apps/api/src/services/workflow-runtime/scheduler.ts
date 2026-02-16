import type { DomainEventType } from "@scheduling/dto";
import type { WorkflowExecution } from "../../repositories/workflows.js";
import type {
  NextNodeResolver,
  NodeExecutionResult,
  NodeRuntimeStatus,
  ParsedGraph,
  ParsedNode,
} from "./types.js";

type SchedulerExecution = WorkflowExecution & { status: string };

type WorkflowSchedulerInput<TExecution extends SchedulerExecution> = {
  graph: ParsedGraph;
  incomingByNodeId: Map<string, string[]>;
  eventType: DomainEventType;
  loadExecution: () => Promise<TExecution | null>;
  executeNode: (input: {
    node: ParsedNode;
    execution: TExecution;
  }) => Promise<NodeExecutionResult>;
  getNextNodeIds: NextNodeResolver;
  isWaitNode: (node: ParsedNode | undefined) => boolean;
};

function isExecutionActive(status: string): boolean {
  return status === "running" || status === "waiting";
}

export type WorkflowSchedulerResult = {
  hasNodeFailure: boolean;
  nodeStatuses: Map<string, NodeRuntimeStatus>;
};

function sortNextNodeIds(input: {
  nodeIds: string[];
  graph: ParsedGraph;
  isWaitNode: (node: ParsedNode | undefined) => boolean;
}): string[] {
  return [...input.nodeIds].toSorted((left, right) => {
    const leftWait = input.isWaitNode(input.graph.nodeById.get(left));
    const rightWait = input.isWaitNode(input.graph.nodeById.get(right));

    if (leftWait === rightWait) {
      return left.localeCompare(right);
    }

    return leftWait ? 1 : -1;
  });
}

export async function runWorkflowScheduler<
  TExecution extends SchedulerExecution,
>(input: WorkflowSchedulerInput<TExecution>): Promise<WorkflowSchedulerResult> {
  const completedNodes = new Set<string>();
  const inProgressNodes = new Map<string, Promise<void>>();
  const nodeStatuses = new Map<string, NodeRuntimeStatus>(
    [...input.graph.nodeById.keys()].map((nodeId) => [nodeId, "pending"]),
  );

  let hasNodeFailure = false;

  const executeNode = async (nodeId: string): Promise<void> => {
    if (hasNodeFailure || completedNodes.has(nodeId)) {
      return;
    }

    const inProgress = inProgressNodes.get(nodeId);
    if (inProgress) {
      return inProgress;
    }

    const task = (async () => {
      if (hasNodeFailure || completedNodes.has(nodeId)) {
        return;
      }

      const execution = await input.loadExecution();
      if (!execution || !isExecutionActive(execution.status)) {
        nodeStatuses.set(nodeId, "cancelled");
        return;
      }

      const node = input.graph.nodeById.get(nodeId);
      if (!node) {
        return;
      }

      const incomingSources = input.incomingByNodeId.get(node.id) ?? [];
      if (incomingSources.some((sourceId) => !completedNodes.has(sourceId))) {
        return;
      }

      nodeStatuses.set(nodeId, "running");

      const nodeResult = await input.executeNode({ node, execution });
      if (nodeResult.failed) {
        hasNodeFailure = true;
        nodeStatuses.set(nodeId, "error");
        return;
      }

      completedNodes.add(node.id);
      nodeStatuses.set(node.id, nodeResult.status ?? "success");

      if (nodeResult.haltBranch) {
        return;
      }

      const nextNodeIds = input.getNextNodeIds({
        node,
        outgoingByNodeId: input.graph.outgoingByNodeId,
        eventType: input.eventType,
      });

      const sortedNextNodeIds = sortNextNodeIds({
        nodeIds: nextNodeIds,
        graph: input.graph,
        isWaitNode: input.isWaitNode,
      });

      await Promise.all(
        sortedNextNodeIds.map((nextNodeId) => executeNode(nextNodeId)),
      );
    })().finally(() => {
      inProgressNodes.delete(nodeId);
    });

    inProgressNodes.set(nodeId, task);
    return task;
  };

  await executeNode(input.graph.triggerNode.id);

  return {
    hasNodeFailure,
    nodeStatuses,
  };
}
