import type { NodeProps } from "@xyflow/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type AddNodeData = {
  onClick?: () => void;
};

const AddNode = memo(function AddNode({ data }: NodeProps) {
  const nodeData = data as AddNodeData;

  return (
    <div className="flex h-48 w-48 items-center justify-center rounded-lg border border-dashed border-border bg-background/50 backdrop-blur-sm">
      <Button onClick={nodeData.onClick} variant="outline" size="sm">
        <Icon icon={Add01Icon} className="size-4" />
        Add a Step
      </Button>
    </div>
  );
});

AddNode.displayName = "AddNode";

export { AddNode };
