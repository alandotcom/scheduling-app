// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import {
  BaseEdge,
  getBezierPath,
  getSimpleBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const branch =
    data && typeof data === "object" && "branch" in data
      ? (data as { branch?: string }).branch
      : undefined;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? "var(--muted-foreground)" : "var(--border)",
          strokeWidth: 2,
          strokeDasharray: 5,
          animation: "workflow-dashdraw 0.5s linear infinite",
        }}
      />
      {branch ? (
        <text>
          <textPath
            href={`#${id}`}
            startOffset="50%"
            textAnchor="middle"
            dominantBaseline="text-before-edge"
            style={{
              fontSize: 10,
              fill: branch === "true" ? "#4ade80" : "#f87171",
              fontWeight: 600,
            }}
          >
            {branch}
          </textPath>
        </text>
      ) : null}
    </>
  );
}

export function TemporaryEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const [edgePath] = getSimpleBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: "var(--border)",
        strokeWidth: 1,
        strokeDasharray: "5, 5",
      }}
    />
  );
}
