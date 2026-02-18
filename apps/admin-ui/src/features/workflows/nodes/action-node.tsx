import {
  Position,
  type Node as ReactFlowNode,
  type NodeProps,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { useAtomValue } from "jotai";
import {
  BlockedIcon,
  CancelCircleIcon,
  Tick02Icon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { memo, useEffect, useMemo, useState } from "react";
import {
  Node,
  NodeDescription,
  NodeTitle,
} from "@/components/flow-elements/node";
import { cn } from "@/lib/utils";
import { getAction } from "../action-registry";
import {
  getActionDefaultNodeLabel,
  getActionVisualSpec,
  isGenericActionNodeLabel,
} from "../action-visuals";
import {
  selectedExecutionIdAtom,
  workflowEditorEdgesAtom,
  workflowExecutionLogsByNodeIdAtom,
  type WorkflowActionNodeData,
  type WorkflowExecutionNodeLogPreview,
} from "../workflow-editor-store";
import {
  formatCountdown,
  formatTriggerTime,
  hasDynamicExpression,
  parseTimestampWithTimezone,
  resolveWaitUntil,
} from "../wait-time";

type ActionFlowNode = ReactFlowNode<WorkflowActionNodeData, "action">;
type ActionNodeProps = NodeProps<ActionFlowNode>;

type WaitPreviewData = {
  countdown: string;
  triggerTimeMain: string;
  triggerTimeZone?: string;
};

type RuntimeWaitInput = {
  waitDuration?: unknown;
  waitUntil?: unknown;
  waitOffset?: unknown;
  waitTimezone?: unknown;
};

const CONDITION_TRUE_HANDLE_TOP = "33%";
const CONDITION_FALSE_HANDLE_TOP = "67%";

type ConditionBranch = "true" | "false";

type ConditionBranchOccupancy = {
  true: boolean;
  false: boolean;
};

function normalizeConditionBranch(value: unknown): ConditionBranch | null {
  if (typeof value !== "string") {
    return null;
  }

  let normalized = value.trim().toLowerCase();
  if (normalized.startsWith("branch-")) {
    normalized = normalized.slice("branch-".length);
  }

  if (normalized === "true" || normalized === "false") {
    return normalized;
  }

  return null;
}

function getConditionBranchOccupancy(input: {
  nodeId: string;
  edges: Array<{ source: string; sourceHandle?: string | null }>;
}): ConditionBranchOccupancy {
  const occupancy: ConditionBranchOccupancy = {
    true: false,
    false: false,
  };

  for (const edge of input.edges) {
    if (edge.source !== input.nodeId) {
      continue;
    }

    const branch = normalizeConditionBranch(edge.sourceHandle);
    if (!branch) {
      continue;
    }

    occupancy[branch] = true;
  }

  return occupancy;
}

function toRuntimeNodeStatus(
  status: WorkflowExecutionNodeLogPreview["status"] | undefined,
): WorkflowActionNodeData["status"] {
  if (!status || status === "pending") {
    return "idle";
  }

  return status;
}

function getWaitDelayTimingMode(
  config: WorkflowActionNodeData["config"],
): "duration" | "until" {
  const configured =
    typeof config?.waitDelayTimingMode === "string"
      ? config.waitDelayTimingMode
      : "";

  if (configured === "duration" || configured === "until") {
    return configured;
  }

  const waitUntil =
    typeof config?.waitUntil === "string" ? config.waitUntil.trim() : "";
  return waitUntil ? "until" : "duration";
}

function toSignaturePart(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return String(value ?? "");
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function getPreviewBaseNowMs(_waitSignature: string): number {
  return Date.now();
}

function useConfigWaitPreview(
  actionType: string | undefined,
  config: WorkflowActionNodeData["config"],
): WaitPreviewData | null {
  const shouldShowWaitPreview = actionType === "wait";
  const delayTimingMode = getWaitDelayTimingMode(config);
  const waitDuration = config?.waitDuration;
  const waitUntil = config?.waitUntil;
  const waitOffset = config?.waitOffset;
  const waitTimezone =
    typeof config?.waitTimezone === "string" && config.waitTimezone.trim()
      ? config.waitTimezone.trim()
      : undefined;

  const hasDynamicValue =
    hasDynamicExpression(waitDuration) ||
    hasDynamicExpression(waitUntil) ||
    hasDynamicExpression(waitOffset);

  const waitSignature = [
    delayTimingMode,
    toSignaturePart(waitDuration),
    toSignaturePart(waitUntil),
    toSignaturePart(waitOffset),
    toSignaturePart(waitTimezone),
  ].join("|");
  const previewBaseNowMs = useMemo(
    () => getPreviewBaseNowMs(waitSignature),
    [waitSignature],
  );

  const resolution = useMemo(() => {
    if (!(shouldShowWaitPreview && !hasDynamicValue)) {
      return null;
    }

    return resolveWaitUntil({
      now: new Date(previewBaseNowMs),
      waitDuration: delayTimingMode === "duration" ? waitDuration : undefined,
      waitUntil: delayTimingMode === "until" ? waitUntil : undefined,
      waitOffset: delayTimingMode === "until" ? waitOffset : undefined,
      waitTimezone,
    });
  }, [
    shouldShowWaitPreview,
    hasDynamicValue,
    delayTimingMode,
    previewBaseNowMs,
    waitDuration,
    waitUntil,
    waitOffset,
    waitTimezone,
  ]);

  if (!shouldShowWaitPreview) {
    return null;
  }

  if (hasDynamicValue) {
    return {
      countdown: "Runtime-calculated",
      triggerTimeMain: "Trigger time comes from workflow data",
    };
  }

  if (!resolution?.waitUntil) {
    return {
      countdown: "Set wait duration",
      triggerTimeMain: "Add a valid wait time",
    };
  }

  const triggerTime = formatTriggerTime(resolution.waitUntil, waitTimezone);
  return {
    countdown: formatCountdown(
      resolution.waitUntil.getTime() - previewBaseNowMs,
    ),
    triggerTimeMain: triggerTime.main,
    triggerTimeZone: triggerTime.timezone,
  };
}

function useRuntimeWaitPreview(
  actionType: string | undefined,
  selectedExecutionId: string | null,
  nodeLog: WorkflowExecutionNodeLogPreview | undefined,
): WaitPreviewData | null {
  const shouldShowRuntimeWaitPreview =
    actionType === "wait" &&
    selectedExecutionId !== null &&
    nodeLog !== undefined &&
    (nodeLog.status === "running" || nodeLog.status === "pending");

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!shouldShowRuntimeWaitPreview) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [shouldShowRuntimeWaitPreview]);

  const runtimeInput = useMemo(() => {
    if (
      !(shouldShowRuntimeWaitPreview && nodeLog?.input) ||
      typeof nodeLog.input !== "object"
    ) {
      return null;
    }

    return nodeLog.input as RuntimeWaitInput;
  }, [shouldShowRuntimeWaitPreview, nodeLog?.input]);

  const startedAt = useMemo(() => {
    if (!shouldShowRuntimeWaitPreview) {
      return null;
    }

    return parseTimestampWithTimezone(nodeLog?.startedAt);
  }, [nodeLog?.startedAt, shouldShowRuntimeWaitPreview]);

  if (!(shouldShowRuntimeWaitPreview && runtimeInput && startedAt)) {
    return null;
  }

  const waitTimezone =
    typeof runtimeInput.waitTimezone === "string" &&
    runtimeInput.waitTimezone.trim()
      ? runtimeInput.waitTimezone.trim()
      : undefined;

  const resolution = resolveWaitUntil({
    now: startedAt,
    waitDuration: runtimeInput.waitDuration,
    waitUntil: runtimeInput.waitUntil,
    waitOffset: runtimeInput.waitOffset,
    waitTimezone,
  });

  if (!resolution.waitUntil) {
    return {
      countdown: "Runtime-calculated",
      triggerTimeMain: "Waiting timestamp unavailable",
    };
  }

  const triggerTime = formatTriggerTime(resolution.waitUntil, waitTimezone);
  return {
    countdown: formatCountdown(resolution.waitUntil.getTime() - nowMs),
    triggerTimeMain: triggerTime.main,
    triggerTimeZone: triggerTime.timezone,
  };
}

function StatusBadge({ status }: { status: WorkflowActionNodeData["status"] }) {
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

const ActionNode = memo(function ActionNode({
  id,
  data: nodeData,
  selected,
}: ActionNodeProps) {
  const isDisabled = nodeData.enabled === false;
  const actionType = nodeData.config?.actionType;
  const actionDef = actionType ? getAction(actionType) : undefined;
  const selectedExecutionId = useAtomValue(selectedExecutionIdAtom);
  const workflowEdges = useAtomValue(workflowEditorEdgesAtom);
  const executionLogsByNodeId = useAtomValue(workflowExecutionLogsByNodeIdAtom);
  const runtimeWaitPreview = useRuntimeWaitPreview(
    actionType,
    selectedExecutionId,
    executionLogsByNodeId[id],
  );
  const configWaitPreview = useConfigWaitPreview(actionType, nodeData.config);
  const waitPreview = runtimeWaitPreview ?? configWaitPreview;
  const actionVisual = getActionVisualSpec(actionType);
  const configuredLabel =
    typeof nodeData.label === "string" ? nodeData.label : "";
  const defaultTitle =
    getActionDefaultNodeLabel(actionType) ?? actionDef?.label ?? "Action";
  const title =
    configuredLabel.trim().length > 0 &&
    !isGenericActionNodeLabel(configuredLabel)
      ? configuredLabel
      : defaultTitle;
  const description =
    nodeData.description || actionDef?.description || "Select an action";
  const isConditionAction = actionType === "condition";
  const conditionBranchOccupancy = useMemo(
    () => getConditionBranchOccupancy({ nodeId: id, edges: workflowEdges }),
    [id, workflowEdges],
  );
  const updateNodeInternals = useUpdateNodeInternals();
  const runtimeStatus =
    selectedExecutionId !== null
      ? toRuntimeNodeStatus(executionLogsByNodeId[id]?.status)
      : undefined;
  const status = runtimeStatus ?? nodeData.status;

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, isConditionAction, updateNodeInternals]);

  return (
    <Node
      handles={{
        target: true,
        source: isConditionAction
          ? [
              {
                id: "true",
                position: Position.Right,
                style: {
                  top: CONDITION_TRUE_HANDLE_TOP,
                  width: 14,
                  height: 14,
                },
              },
              {
                id: "false",
                position: Position.Right,
                style: {
                  top: CONDITION_FALSE_HANDLE_TOP,
                  width: 14,
                  height: 14,
                },
              },
            ]
          : true,
      }}
      status={status}
      className={cn(
        "h-48 w-48 flex-col items-center justify-center shadow-none",
        selected && "border-primary",
        isDisabled && "opacity-50",
      )}
    >
      {isConditionAction && !conditionBranchOccupancy.true ? (
        <div
          className="-translate-y-1/2 pointer-events-none absolute top-0 right-[-4.75rem] z-30 rounded-sm border bg-card px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
          style={{ top: CONDITION_TRUE_HANDLE_TOP }}
        >
          True
        </div>
      ) : null}
      {isConditionAction && !conditionBranchOccupancy.false ? (
        <div
          className="-translate-y-1/2 pointer-events-none absolute top-0 right-[-4.75rem] z-30 rounded-sm border bg-card px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
          style={{ top: CONDITION_FALSE_HANDLE_TOP }}
        >
          False
        </div>
      ) : null}
      {isDisabled && (
        <div className="absolute top-2 left-2 flex size-5 items-center justify-center rounded-full bg-muted">
          <Icon icon={ViewOffIcon} className="size-3 text-muted-foreground" />
        </div>
      )}
      <StatusBadge status={status} />
      <div className="flex flex-col items-center gap-2 p-4 text-center">
        <div className="flex size-12 items-center justify-center">
          {actionVisual.brandIcon ? (
            <actionVisual.brandIcon
              className="size-12"
              data-testid={`action-node-brand-logo-${actionType ?? "unknown"}`}
            />
          ) : (
            <div
              className={cn(
                "flex size-12 items-center justify-center rounded-lg",
                actionVisual.iconBgClass,
              )}
            >
              <Icon
                icon={actionVisual.icon}
                className={cn("size-6", actionVisual.iconColorClass)}
              />
            </div>
          )}
        </div>
        <NodeTitle className="text-base font-medium">{title}</NodeTitle>
        {waitPreview ? (
          <div className="flex flex-col items-center gap-0.5">
            <NodeDescription className="font-medium text-[11px] tabular-nums">
              {waitPreview.countdown}
            </NodeDescription>
            <NodeDescription className="max-w-[10.5rem] text-[10px] leading-tight">
              {waitPreview.triggerTimeMain}
            </NodeDescription>
            {waitPreview.triggerTimeZone ? (
              <NodeDescription className="text-[10px] leading-tight">
                {waitPreview.triggerTimeZone}
              </NodeDescription>
            ) : null}
          </div>
        ) : (
          <NodeDescription className="text-xs">{description}</NodeDescription>
        )}
      </div>
    </Node>
  );
});

ActionNode.displayName = "ActionNode";

export { ActionNode };
