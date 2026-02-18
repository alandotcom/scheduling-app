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
          sourcePosition: fromPosition ?? Position.Bottom,
          targetX: toX,
          targetY: toY,
          targetPosition: toPosition ?? Position.Top,
          borderRadius: 12,
          offset: 16,
        })[0]
      }
      fill="none"
      stroke="var(--color-ring)"
      strokeWidth={1.8}
    />
    <circle
      cx={toX}
      cy={toY}
      fill="#fff"
      r={2.75}
      stroke="var(--color-ring)"
      strokeWidth={1.8}
    />
  </g>
);
