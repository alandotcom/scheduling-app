import type { ConnectionLineComponent } from "@xyflow/react";
import type { EditorNode } from "../workflow-editor-types";

const HALF = 0.5;

export const Connection: ConnectionLineComponent<EditorNode> = ({
  fromX,
  fromY,
  toX,
  toY,
}) => (
  <g>
    <path
      d={`M${fromX},${fromY} C ${fromX + (toX - fromX) * HALF},${fromY} ${fromX + (toX - fromX) * HALF},${toY} ${toX},${toY}`}
      fill="none"
      stroke="var(--color-ring)"
      strokeWidth={1.5}
    />
    <circle
      cx={toX}
      cy={toY}
      fill="#fff"
      r={3}
      stroke="var(--color-ring)"
      strokeWidth={1}
    />
  </g>
);
