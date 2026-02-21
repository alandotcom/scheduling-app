import {
  type Node as ReactFlowNode,
  type NodeProps,
  Position,
  useUpdateNodeInternals,
} from "@xyflow/react";
import {
  BlockedIcon,
  CancelCircleIcon,
  PlayIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { useAtomValue } from "jotai";
import { memo, useEffect, useMemo } from "react";
import { Icon } from "@/components/ui/icon";
import {
  Node,
  NodeDescription,
  NodeTitle,
} from "@/components/flow-elements/node";
import { cn } from "@/lib/utils";
import {
  selectedExecutionIdAtom,
  workflowActiveCanvasEdgesAtom,
  type WorkflowCanvasEdge,
  type WorkflowTriggerNodeData,
  workflowExecutionLogsByNodeIdAtom,
  type WorkflowExecutionNodeLogPreview,
  getTriggerBranchFromEdge,
} from "../workflow-editor-store";
import {
  WORKFLOW_NODE_HEIGHT,
  WORKFLOW_NODE_WIDTH,
} from "../workflow-node-dimensions";

const TRIGGER_SCHEDULED_HANDLE_LEFT = "37%";
const TRIGGER_CANCELED_HANDLE_LEFT = "63%";
const TRIGGER_CLIENT_HANDLE_LEFT = "50%";

type TriggerBranchOccupancy = {
  scheduled: boolean;
  canceled: boolean;
};

function getTriggerBranchOccupancy(input: {
  nodeId: string;
  edges: WorkflowCanvasEdge[];
}): TriggerBranchOccupancy {
  const occupancy: TriggerBranchOccupancy = {
    scheduled: false,
    canceled: false,
  };

  for (const edge of input.edges) {
    if (edge.source !== input.nodeId) {
      continue;
    }

    const branch = getTriggerBranchFromEdge(edge);
    if (!branch) {
      continue;
    }

    occupancy[branch] = true;
  }

  return occupancy;
}

type TriggerFlowNode = ReactFlowNode<WorkflowTriggerNodeData, "trigger">;
type TriggerNodeProps = NodeProps<TriggerFlowNode>;

function toRuntimeNodeStatus(
  status: WorkflowExecutionNodeLogPreview["status"] | undefined,
): WorkflowTriggerNodeData["status"] {
  if (!status || status === "pending") {
    return "idle";
  }

  return status;
}

function StatusBadge({
  status,
}: {
  status: WorkflowTriggerNodeData["status"];
}) {
  if (!status || status === "idle" || status === "running") return null;

  return (
    <div
      className={cn(
        "absolute top-2 right-2 flex size-5 items-center justify-center rounded-full",
        status === "success" && "bg-green-500/50",
        status === "error" && "bg-red-500/50",
        status === "cancelled" && "bg-slate-500/50",
      )}
    >
      <Icon
        icon={
          status === "success"
            ? Tick02Icon
            : status === "error"
              ? CancelCircleIcon
              : BlockedIcon
        }
        className="size-3 text-white"
      />
    </div>
  );
}

const TriggerNode = memo(function TriggerNode({
  id,
  data: nodeData,
  selected,
}: TriggerNodeProps) {
  const selectedExecutionId = useAtomValue(selectedExecutionIdAtom);
  const executionLogsByNodeId = useAtomValue(workflowExecutionLogsByNodeIdAtom);
  const workflowEdges = useAtomValue(workflowActiveCanvasEdgesAtom);
  const triggerBranchOccupancy = useMemo(
    () => getTriggerBranchOccupancy({ nodeId: id, edges: workflowEdges }),
    [id, workflowEdges],
  );
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, updateNodeInternals]);

  const title = nodeData.label || "Trigger";
  const runtimeStatus =
    selectedExecutionId !== null
      ? toRuntimeNodeStatus(executionLogsByNodeId[id]?.status)
      : undefined;
  const status = runtimeStatus ?? nodeData.status;
  const isClientJourneyTrigger =
    nodeData.config?.triggerType === "ClientJourney" ||
    nodeData.config?.event === "client.created" ||
    nodeData.config?.event === "client.updated" ||
    nodeData.config?.correlationKey === "clientId";
  const clientEventLabel =
    nodeData.config?.event === "client.updated" ? "Updated" : "Created";
  const entryBranchLeft = isClientJourneyTrigger
    ? TRIGGER_CLIENT_HANDLE_LEFT
    : TRIGGER_SCHEDULED_HANDLE_LEFT;
  const entryBranchLabel = isClientJourneyTrigger
    ? clientEventLabel
    : "Scheduled";
  const description =
    nodeData.description ||
    (isClientJourneyTrigger ? "Client trigger" : "Appointment trigger");

  return (
    <Node
      handles={{
        target: false,
        source: isClientJourneyTrigger
          ? [
              {
                id: "scheduled",
                position: Position.Bottom,
                style: {
                  left: TRIGGER_CLIENT_HANDLE_LEFT,
                  width: 14,
                  height: 14,
                },
              },
            ]
          : [
              {
                id: "scheduled",
                position: Position.Bottom,
                style: {
                  left: TRIGGER_SCHEDULED_HANDLE_LEFT,
                  width: 14,
                  height: 14,
                },
              },
              {
                id: "canceled",
                position: Position.Bottom,
                style: {
                  left: TRIGGER_CANCELED_HANDLE_LEFT,
                  width: 14,
                  height: 14,
                },
              },
            ],
      }}
      status={status}
      style={{
        width: WORKFLOW_NODE_WIDTH,
        height: WORKFLOW_NODE_HEIGHT,
      }}
      className={cn(
        "flex-col items-center justify-center border-[var(--workflow-trigger-border)] bg-[var(--workflow-trigger-bg)] shadow-none",
        selected && "border-primary",
      )}
    >
      <StatusBadge status={status} />
      {!triggerBranchOccupancy.scheduled ? (
        <div
          className="pointer-events-none absolute -bottom-8 z-30 -translate-x-1/2 rounded-sm border bg-card px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
          style={{ left: entryBranchLeft }}
        >
          {entryBranchLabel}
        </div>
      ) : null}
      {!isClientJourneyTrigger && !triggerBranchOccupancy.canceled ? (
        <div
          className="pointer-events-none absolute -bottom-8 z-30 -translate-x-1/2 rounded-sm border bg-card px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
          style={{ left: TRIGGER_CANCELED_HANDLE_LEFT }}
        >
          Canceled
        </div>
      ) : null}
      <div className="flex flex-col items-center gap-2 p-4 text-center">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon icon={PlayIcon} className="size-5 text-primary" />
        </div>
        <NodeTitle className="text-base font-medium">{title}</NodeTitle>
        <NodeDescription className="text-xs">{description}</NodeDescription>
      </div>
    </Node>
  );
});

TriggerNode.displayName = "TriggerNode";

export { TriggerNode };
