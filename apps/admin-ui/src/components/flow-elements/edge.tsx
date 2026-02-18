import {
  BaseEdge,
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
  if (value === "created") {
    return "Created";
  }

  if (value === "updated") {
    return "Updated";
  }

  if (value === "deleted") {
    return "Deleted";
  }

  return null;
}

function getConditionBranchLabel(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  let normalized = value.trim().toLowerCase();
  if (normalized.startsWith("branch-")) {
    normalized = normalized.slice("branch-".length);
  }

  if (normalized === "true") {
    return "True";
  }

  if (normalized === "false") {
    return "False";
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

  return getSwitchBranchLabel(data.switchBranch) ?? undefined;
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
        stroke: selected ? "var(--muted-foreground)" : "var(--border)",
        strokeDasharray: "5, 5",
        strokeWidth: 2.5,
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
    handlePosition: Position.Right,
    handleId: input?.sourceHandleId ?? null,
  });
  const targetHandle = getHandleCoordsByPosition(target, {
    handleType: "target",
    handlePosition: Position.Left,
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
    borderRadius: 14,
    offset: 20,
  });

  const edgeLabel = getEdgeLabel({ label, data });

  return (
    <BaseEdge
      id={id}
      label={edgeLabel}
      labelBgPadding={[10, 4]}
      labelBgStyle={{ fill: "var(--card)", stroke: "var(--border)" }}
      labelStyle={{ fill: "var(--muted-foreground)", fontSize: 11 }}
      labelX={labelX}
      labelY={labelY}
      labelShowBg={!!edgeLabel}
      path={edgePath}
      style={{
        ...style,
        stroke: selected ? "var(--muted-foreground)" : "var(--border)",
        strokeWidth: 3,
        animation: "dashdraw 0.5s linear infinite",
        strokeDasharray: 5,
      }}
    />
  );
});

export const Edge = {
  Temporary,
  Animated,
};
