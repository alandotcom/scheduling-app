import {
  BaseEdge,
  getBezierPath,
  getSimpleBezierPath,
  type EdgeProps,
  type InternalNode,
  type Node,
  Position,
  useInternalNode,
} from "@xyflow/react";

function Temporary({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
}: EdgeProps) {
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
}

function getHandleCoordsByPosition(
  node: InternalNode<Node>,
  handlePosition: Position,
) {
  const handleType = handlePosition === Position.Left ? "target" : "source";

  const handle = node.internals.handleBounds?.[handleType]?.find(
    (entry) => entry.position === handlePosition,
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
    default:
      break;
  }

  const x = node.internals.positionAbsolute.x + handle.x + offsetX;
  const y = node.internals.positionAbsolute.y + handle.y + offsetY;

  return [x, y] as const;
}

function getEdgeParams(source: InternalNode<Node>, target: InternalNode<Node>) {
  const sourcePos = Position.Right;
  const [sx, sy] = getHandleCoordsByPosition(source, sourcePos);
  const targetPos = Position.Left;
  const [tx, ty] = getHandleCoordsByPosition(target, targetPos);

  return { sx, sy, tx, ty, sourcePos, targetPos };
}

function Animated({ id, source, target, style, selected }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!(sourceNode && targetNode)) {
    return null;
  }

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    sourceNode,
    targetNode,
  );

  const [edgePath] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
  });

  return (
    <BaseEdge
      id={id}
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
}

export const Edge = {
  Animated,
  Temporary,
};
