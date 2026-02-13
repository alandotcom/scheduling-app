// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

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
          stroke: selected
            ? "var(--sidebar-primary)"
            : "var(--sidebar-foreground)",
          strokeWidth: 2,
          strokeOpacity: selected ? 1 : 0.45,
          strokeDasharray: "6 3",
          animation: "dash 0.5s linear infinite",
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
  const [edgePath] = getBezierPath({
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
        stroke: "var(--sidebar-foreground)",
        strokeWidth: 2,
        strokeOpacity: 0.3,
        strokeDasharray: "4 4",
      }}
    />
  );
}
