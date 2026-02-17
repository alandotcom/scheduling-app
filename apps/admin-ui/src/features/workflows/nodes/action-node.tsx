import {
  Position,
  type NodeProps,
  useUpdateNodeInternals,
} from "@xyflow/react";
import type { IconSvgElement } from "@hugeicons/react";
import { useAtomValue } from "jotai";
import {
  BlockedIcon,
  CancelCircleIcon,
  FlashIcon,
  HourglassIcon,
  Tick02Icon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Node,
  NodeDescription,
  NodeTitle,
} from "@/components/flow-elements/node";
import { cn } from "@/lib/utils";
import { getAction } from "../action-registry";
import {
  selectedExecutionIdAtom,
  workflowExecutionLogsByNodeIdAtom,
  type WorkflowExecutionNodeLogPreview,
} from "../workflow-editor-store";
import {
  formatCountdown,
  formatTriggerTime,
  hasDynamicExpression,
  parseTimestampWithTimezone,
  resolveWaitUntil,
} from "../wait-time";

type ActionNodeData = {
  label?: string;
  description?: string;
  status?: "idle" | "running" | "success" | "error" | "cancelled";
  enabled?: boolean;
  config?: {
    actionType?: string;
    waitDelayTimingMode?: string;
    waitDuration?: unknown;
    waitUntil?: unknown;
    waitOffset?: unknown;
    waitTimezone?: unknown;
  };
};

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

function toRuntimeNodeStatus(
  status: WorkflowExecutionNodeLogPreview["status"] | undefined,
): ActionNodeData["status"] {
  if (!status || status === "pending") {
    return "idle";
  }

  return status;
}

function getWaitDelayTimingMode(
  config: ActionNodeData["config"],
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

function useConfigWaitPreview(
  actionType: string | undefined,
  config: ActionNodeData["config"],
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

  const previewBaseNowMsRef = useRef(Date.now());
  const waitSignatureRef = useRef("");
  const waitSignature = [
    delayTimingMode,
    toSignaturePart(waitDuration),
    toSignaturePart(waitUntil),
    toSignaturePart(waitOffset),
    toSignaturePart(waitTimezone),
  ].join("|");

  if (shouldShowWaitPreview && waitSignatureRef.current !== waitSignature) {
    waitSignatureRef.current = waitSignature;
    previewBaseNowMsRef.current = Date.now();
  }

  const resolution = useMemo(() => {
    if (!(shouldShowWaitPreview && !hasDynamicValue)) {
      return null;
    }

    return resolveWaitUntil({
      now: new Date(previewBaseNowMsRef.current),
      waitDuration: delayTimingMode === "duration" ? waitDuration : undefined,
      waitUntil: delayTimingMode === "until" ? waitUntil : undefined,
      waitOffset: delayTimingMode === "until" ? waitOffset : undefined,
      waitTimezone,
    });
  }, [
    shouldShowWaitPreview,
    hasDynamicValue,
    delayTimingMode,
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
      resolution.waitUntil.getTime() - previewBaseNowMsRef.current,
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

function getActionIconAndColor(actionType?: string): {
  icon: IconSvgElement;
  colorClass: string;
  bgClass: string;
} {
  switch (actionType) {
    case "send-resend":
    case "send-slack":
      return {
        icon: FlashIcon,
        colorClass: "text-cyan-500",
        bgClass: "bg-cyan-500/10",
      };
    case "wait":
      return {
        icon: HourglassIcon,
        colorClass: "text-orange-500",
        bgClass: "bg-orange-500/10",
      };
    case "condition":
      return {
        icon: FlashIcon,
        colorClass: "text-emerald-500",
        bgClass: "bg-emerald-500/10",
      };
    case "logger":
      return {
        icon: FlashIcon,
        colorClass: "text-sky-500",
        bgClass: "bg-sky-500/10",
      };
    default:
      return {
        icon: FlashIcon,
        colorClass: "text-muted-foreground",
        bgClass: "bg-muted",
      };
  }
}

function StatusBadge({ status }: { status: ActionNodeData["status"] }) {
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

const ActionNode = memo(function ActionNode({ id, data, selected }: NodeProps) {
  const nodeData = data as ActionNodeData;
  const isDisabled = nodeData.enabled === false;
  const actionType = nodeData.config?.actionType;
  const actionDef = actionType ? getAction(actionType) : undefined;
  const selectedExecutionId = useAtomValue(selectedExecutionIdAtom);
  const executionLogsByNodeId = useAtomValue(workflowExecutionLogsByNodeIdAtom);
  const runtimeWaitPreview = useRuntimeWaitPreview(
    actionType,
    selectedExecutionId,
    executionLogsByNodeId[id],
  );
  const configWaitPreview = useConfigWaitPreview(actionType, nodeData.config);
  const waitPreview = runtimeWaitPreview ?? configWaitPreview;
  const { icon, colorClass, bgClass } = getActionIconAndColor(actionType);
  const title = nodeData.label || actionDef?.label || "Action";
  const description =
    nodeData.description || actionDef?.description || "Select an action";
  const isConditionAction = actionType === "condition";
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
      {isConditionAction ? (
        <div
          className="-translate-y-1/2 pointer-events-none absolute top-0 right-[-4.75rem] z-30 rounded-sm border bg-card px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
          style={{ top: CONDITION_TRUE_HANDLE_TOP }}
        >
          True
        </div>
      ) : null}
      {isConditionAction ? (
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
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-lg",
            bgClass,
          )}
        >
          <Icon icon={icon} className={cn("size-6", colorClass)} />
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
