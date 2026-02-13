// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import type { ConnectionLineComponentProps } from "@xyflow/react";

export function ConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
}: ConnectionLineComponentProps) {
  return (
    <g>
      <path
        d={`M${fromX},${fromY} C${fromX + 60},${fromY} ${toX - 60},${toY} ${toX},${toY}`}
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth={2}
        strokeDasharray={5}
      />
      <circle cx={toX} cy={toY} r={4} fill="var(--muted-foreground)" />
    </g>
  );
}
