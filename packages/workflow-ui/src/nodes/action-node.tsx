// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import { Settings02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { NodeProps } from "@xyflow/react";
import { NodeWrapper } from "../flow-elements/node-wrapper";
import { isBuilderNodeData, type BuilderNodeData } from "../utils";

export function ActionNode({ data, selected }: NodeProps) {
  const nodeData = isBuilderNodeData(data) ? (data as BuilderNodeData) : null;

  return (
    <NodeWrapper
      handles={{ target: true, source: true }}
      selected={selected ?? false}
    >
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <HugeiconsIcon
          icon={Settings02Icon}
          strokeWidth={1.5}
          className="size-12 text-foreground"
        />
        <p className="text-base font-semibold leading-tight">
          {nodeData?.title ?? "Action"}
        </p>
        <p className="max-w-40 truncate text-xs text-muted-foreground">
          {nodeData?.subtitle ?? ""}
        </p>
      </div>
    </NodeWrapper>
  );
}
