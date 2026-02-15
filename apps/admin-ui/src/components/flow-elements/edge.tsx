import {
  BaseEdge,
  type EdgeProps,
  getBezierPath,
  getSimpleBezierPath,
  type InternalNode,
  Position,
  useInternalNode,
} from "@xyflow/react";

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

  return getSwitchBranchLabel(data.switchBranch) ?? undefined;
}

const Temporary = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) => {
  const [edgePath] = getSimpleBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <BaseEdge
      className="stroke-1"
      id={id}
      path={edgePath}
      style={{
        stroke: selected ? "var(--muted-foreground)" : "var(--border)",
        strokeDasharray: "5, 5",
      }}
    />
  );
};

const getHandleCoordsByPosition = (
  node: InternalNode,
  handlePosition: Position,
) => {
  const handleType = handlePosition === Position.Left ? "target" : "source";

  const handle = node.internals.handleBounds?.[handleType]?.find(
    (h) => h.position === handlePosition,
  );

  if (!handle) {
    return [0, 0] as const;
  }

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

  return [x, y] as const;
};

const getEdgeParams = (source: InternalNode, target: InternalNode) => {
  const sourcePos = Position.Right;
  const [sx, sy] = getHandleCoordsByPosition(source, sourcePos);
  const targetPos = Position.Left;
  const [tx, ty] = getHandleCoordsByPosition(target, targetPos);

  return {
    sx,
    sy,
    tx,
    ty,
    sourcePos,
    targetPos,
  };
};

const Animated = ({
  id,
  source,
  target,
  style,
  selected,
  label,
  data,
}: EdgeProps) => {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!(sourceNode && targetNode)) {
    return null;
  }

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    sourceNode,
    targetNode,
  );

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
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
        strokeWidth: 2,
        animation: "dashdraw 0.5s linear infinite",
        strokeDasharray: 5,
      }}
    />
  );
};

export const Edge = {
  Temporary,
  Animated,
};
