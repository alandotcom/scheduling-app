import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
  type InternalNode,
  Position,
  useInternalNode,
} from "@xyflow/react";
import { memo } from "react";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getSwitchBranchLabel(value: unknown): string | null {
  const normalized = normalizeSwitchBranch(value);

  if (normalized === "created") {
    return "Created";
  }

  if (normalized === "updated") {
    return "Updated";
  }

  if (normalized === "deleted") {
    return "Deleted";
  }

  return null;
}

function normalizeConditionBranch(value: unknown): "true" | "false" | null {
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

function getConditionBranchLabel(value: unknown): string | null {
  const normalized = normalizeConditionBranch(value);
  if (normalized === "true") {
    return "True";
  }

  if (normalized === "false") {
    return "False";
  }

  return null;
}

function normalizeTriggerBranch(
  value: unknown,
): "scheduled" | "canceled" | "no_show" | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[\s-]+/g, "_");
  if (
    normalized === "scheduled" ||
    normalized === "canceled" ||
    normalized === "no_show"
  ) {
    return normalized;
  }

  if (normalized === "noshow") {
    return "no_show";
  }

  return null;
}

function getTriggerBranchLabel(value: unknown): string | null {
  const normalized = normalizeTriggerBranch(value);
  if (normalized === "scheduled") {
    return "Scheduled";
  }

  if (normalized === "canceled") {
    return "Canceled";
  }

  if (normalized === "no_show") {
    return "No Show";
  }

  return null;
}

function normalizeSwitchBranch(
  value: unknown,
): "created" | "updated" | "deleted" | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "created" ||
    normalized === "updated" ||
    normalized === "deleted"
  ) {
    return normalized;
  }

  return null;
}

function getEdgeLabel({
  label,
  data,
}: {
  label: EdgeProps["label"];
  data: EdgeProps["data"];
}): string | undefined {
  if (typeof label === "string" && label.trim().length > 0) {
    return label;
  }

  if (!isRecord(data)) {
    return undefined;
  }

  const conditionLabel =
    getConditionBranchLabel(data.conditionBranch) ??
    getConditionBranchLabel(data.branch);
  if (conditionLabel) {
    return conditionLabel;
  }

  const triggerLabel = getTriggerBranchLabel(data.triggerBranch);
  if (triggerLabel) {
    return triggerLabel;
  }

  return getSwitchBranchLabel(data.switchBranch) ?? undefined;
}

type EdgePalette = {
  stroke: string;
  strokeWidth: number;
  strokeOpacity?: number;
  strokeDasharray?: number;
  animation: string;
  labelVariant: EdgeLabelVariant;
};

type ExecutionEdgeStatus = "default" | "active" | "traversed";
type EdgeLabelVariant = "default" | "selected" | "active" | "traversed";

function getExecutionEdgeStatus(data: EdgeProps["data"]): ExecutionEdgeStatus {
  if (!isRecord(data)) {
    return "default";
  }

  const value = data["executionStatus"];
  if (value === "active" || value === "traversed") {
    return value;
  }

  return "default";
}

function getEdgePalette(input: {
  selected: boolean | undefined;
  executionStatus: ExecutionEdgeStatus;
}): EdgePalette {
  if (input.executionStatus === "traversed") {
    return {
      stroke: "var(--workflow-edge-traversed)",
      strokeWidth: 2.2,
      animation: "dashdraw 0.5s linear infinite",
      strokeDasharray: 6,
      labelVariant: "traversed",
    };
  }

  if (input.executionStatus === "active") {
    return {
      stroke: "var(--workflow-edge-active)",
      strokeWidth: 2.2,
      animation: "dashdraw 0.45s linear infinite",
      strokeDasharray: 6,
      labelVariant: "active",
    };
  }

  if (input.selected) {
    return {
      stroke: "var(--foreground)",
      strokeWidth: 2.2,
      animation: "dashdraw 0.6s linear infinite",
      strokeDasharray: 5,
      labelVariant: "selected",
    };
  }

  return {
    stroke: "var(--workflow-edge-default)",
    strokeWidth: 1.9,
    animation: "none",
    labelVariant: "default",
  };
}

function getEdgeLabelClassName(variant: EdgeLabelVariant): string {
  return `workflow-edge-label workflow-edge-label--${variant} nodrag nopan`;
}

function getOffsetFromNormalizedBranches(input: {
  conditionBranch: "true" | "false" | null;
  triggerBranch: "scheduled" | "canceled" | "no_show" | null;
  switchBranch: "created" | "updated" | "deleted" | null;
}): { x: number; y: number } | null {
  if (input.conditionBranch === "true") {
    return { x: 0, y: -14 };
  }

  if (input.conditionBranch === "false") {
    return { x: 0, y: 14 };
  }

  if (input.triggerBranch === "scheduled") {
    return { x: 0, y: -14 };
  }

  if (input.triggerBranch === "canceled") {
    return { x: 0, y: 0 };
  }

  if (input.triggerBranch === "no_show") {
    return { x: 0, y: 14 };
  }

  if (input.switchBranch === "created") {
    return { x: 0, y: -18 };
  }

  if (input.switchBranch === "updated") {
    return { x: 0, y: 0 };
  }

  if (input.switchBranch === "deleted") {
    return { x: 0, y: 18 };
  }

  return null;
}

function getEdgeLabelOffset(input: {
  data: EdgeProps["data"];
  sourceHandleId?: string | null;
  edgeLabel?: string;
}): { x: number; y: number } {
  const labelOffset = getOffsetFromNormalizedBranches({
    conditionBranch: normalizeConditionBranch(input.edgeLabel),
    triggerBranch: normalizeTriggerBranch(input.edgeLabel),
    switchBranch: normalizeSwitchBranch(input.edgeLabel),
  });
  if (labelOffset) {
    return labelOffset;
  }

  const metadataOffset = getOffsetFromNormalizedBranches({
    conditionBranch: isRecord(input.data)
      ? (normalizeConditionBranch(input.data.conditionBranch) ??
        normalizeConditionBranch(input.data.branch))
      : null,
    triggerBranch: isRecord(input.data)
      ? normalizeTriggerBranch(input.data.triggerBranch)
      : null,
    switchBranch: isRecord(input.data)
      ? normalizeSwitchBranch(input.data.switchBranch)
      : null,
  });
  if (metadataOffset) {
    return metadataOffset;
  }

  const sourceHandleOffset = getOffsetFromNormalizedBranches({
    conditionBranch: normalizeConditionBranch(input.sourceHandleId),
    triggerBranch: normalizeTriggerBranch(input.sourceHandleId),
    switchBranch: null,
  });
  if (sourceHandleOffset) {
    return sourceHandleOffset;
  }

  return { x: 0, y: 0 };
}

function getTemporaryEdgeStroke(selected: boolean | undefined): string {
  if (selected) {
    return "var(--workflow-edge-active)";
  }

  return "var(--workflow-edge-default)";
}

const Temporary = memo(function Temporary({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
    offset: 16,
  });

  return (
    <BaseEdge
      className="stroke-1"
      id={id}
      path={edgePath}
      style={{
        stroke: getTemporaryEdgeStroke(selected),
        strokeOpacity: 0.75,
        strokeDasharray: "5, 5",
        strokeWidth: 1.6,
      }}
    />
  );
});

const getHandleCoordsByPosition = (
  node: InternalNode,
  input: {
    handleType: "source" | "target";
    handlePosition: Position;
    handleId?: string | null;
  },
) => {
  const handleCandidates =
    node.internals.handleBounds?.[input.handleType] ?? [];

  const handle =
    (input.handleId
      ? handleCandidates.find((candidate) => candidate.id === input.handleId)
      : undefined) ??
    handleCandidates.find(
      (candidate) => candidate.position === input.handlePosition,
    );

  if (!handle) {
    return {
      x: 0,
      y: 0,
      position: input.handlePosition,
    } as const;
  }

  const handlePosition = handle.position;
  let offsetX = handle.width / 2;
  let offsetY = handle.height / 2;

  switch (handlePosition) {
    case Position.Left:
      offsetX = 0;
      break;
    case Position.Right:
      offsetX = handle.width;
      break;
    case Position.Top:
      offsetY = 0;
      break;
    case Position.Bottom:
      offsetY = handle.height;
      break;
  }

  const x = node.internals.positionAbsolute.x + handle.x + offsetX;
  const y = node.internals.positionAbsolute.y + handle.y + offsetY;

  return {
    x,
    y,
    position: handlePosition,
  } as const;
};

const getEdgeParams = (
  source: InternalNode,
  target: InternalNode,
  input?: {
    sourceHandleId?: string | null;
    targetHandleId?: string | null;
  },
) => {
  const sourceHandle = getHandleCoordsByPosition(source, {
    handleType: "source",
    handlePosition: Position.Bottom,
    handleId: input?.sourceHandleId ?? null,
  });
  const targetHandle = getHandleCoordsByPosition(target, {
    handleType: "target",
    handlePosition: Position.Top,
    handleId: input?.targetHandleId ?? null,
  });

  return {
    sx: sourceHandle.x,
    sy: sourceHandle.y,
    tx: targetHandle.x,
    ty: targetHandle.y,
    sourcePos: sourceHandle.position,
    targetPos: targetHandle.position,
  };
};

const Animated = memo(function Animated({
  id,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  style,
  selected,
  label,
  data,
}: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!(sourceNode && targetNode)) {
    return null;
  }

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    sourceNode,
    targetNode,
    {
      sourceHandleId,
      targetHandleId,
    },
  );

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
    borderRadius: 12,
    offset: 16,
  });

  const edgeLabel = getEdgeLabel({ label, data });
  const palette = getEdgePalette({
    selected,
    executionStatus: getExecutionEdgeStatus(data),
  });
  const labelOffset = getEdgeLabelOffset({
    data,
    sourceHandleId,
    edgeLabel,
  });

  const hasEdgeLabel = typeof edgeLabel === "string" && edgeLabel.length > 0;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: palette.stroke,
          strokeOpacity: palette.strokeOpacity,
          strokeWidth: palette.strokeWidth,
          animation: palette.animation,
          strokeDasharray: palette.strokeDasharray,
        }}
      />
      {hasEdgeLabel ? (
        <EdgeLabelRenderer>
          <div
            className={getEdgeLabelClassName(palette.labelVariant)}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              transform: `translate(-50%, -50%) translate(${labelX + labelOffset.x}px, ${labelY + labelOffset.y}px)`,
            }}
          >
            {edgeLabel}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});

export const Edge = {
  Temporary,
  Animated,
};
