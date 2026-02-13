// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import { Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { NodeProps } from "@xyflow/react";
import { NodeWrapper } from "../flow-elements/node-wrapper";
import { isBuilderNodeData, type BuilderNodeData } from "../utils";

export function WaitNode({ data, selected }: NodeProps) {
  const nodeData = isBuilderNodeData(data) ? (data as BuilderNodeData) : null;

  return (
    <NodeWrapper
      handles={{ target: true, source: true }}
      selected={selected ?? false}
    >
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <HugeiconsIcon
          icon={Clock01Icon}
          strokeWidth={1.5}
          className="size-12 text-amber-500"
        />
        <p className="text-base font-semibold leading-tight">
          {nodeData?.title ?? "Wait"}
        </p>
        <p className="max-w-40 text-xs text-muted-foreground">
          {nodeData?.subtitle ?? ""}
        </p>
      </div>
    </NodeWrapper>
  );
}
