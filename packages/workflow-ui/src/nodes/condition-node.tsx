// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import { GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { NodeProps } from "@xyflow/react";
import { NodeWrapper } from "../flow-elements/node-wrapper";
import { isBuilderNodeData, type BuilderNodeData } from "../utils";

export function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = isBuilderNodeData(data) ? (data as BuilderNodeData) : null;

  return (
    <NodeWrapper
      handles={{
        target: true,
        source: false,
        sourceHandles: [
          { id: "true", style: { top: "35%" } },
          { id: "false", style: { top: "65%" } },
        ],
      }}
      selected={selected ?? false}
    >
      <div className="flex flex-col items-center gap-1 px-3 py-3">
        <HugeiconsIcon
          icon={GitBranchIcon}
          strokeWidth={1.5}
          className="size-7 text-muted-foreground"
        />
        <p className="text-xs font-semibold leading-tight">
          {nodeData?.title ?? "Condition"}
        </p>
        <p className="max-w-full truncate text-[10px] text-muted-foreground">
          {nodeData?.subtitle ?? ""}
        </p>
        <div className="mt-0.5 flex gap-2 text-[9px] font-medium">
          <span className="text-green-600">true</span>
          <span className="text-red-600">false</span>
        </div>
      </div>
    </NodeWrapper>
  );
}
