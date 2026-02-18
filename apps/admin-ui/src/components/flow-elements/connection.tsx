import {
  getSmoothStepPath,
  Position,
  type ConnectionLineComponent,
} from "@xyflow/react";

export const Connection: ConnectionLineComponent = ({
  fromX,
  fromY,
  fromPosition,
  toX,
  toY,
  toPosition,
}) => (
  <g>
    <path
      className="animated"
      d={
        getSmoothStepPath({
          sourceX: fromX,
          sourceY: fromY,
          sourcePosition: fromPosition ?? Position.Right,
          targetX: toX,
          targetY: toY,
          targetPosition: toPosition ?? Position.Left,
          borderRadius: 12,
          offset: 16,
        })[0]
      }
      fill="none"
      stroke="var(--color-ring)"
      strokeWidth={2}
    />
    <circle
      cx={toX}
      cy={toY}
      fill="#fff"
      r={3}
      stroke="var(--color-ring)"
      strokeWidth={2}
    />
  </g>
);
