import type { NodeProps } from "@xyflow/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export type AddNodeData = {
  onClick?: () => void;
};

export function AddNode({ data }: NodeProps) {
  const payload = data as AddNodeData | undefined;

  return (
    <div className="rounded-md border border-dashed bg-background/80 p-6">
      <Button onClick={payload?.onClick} size="sm" variant="outline">
        <Icon icon={Add01Icon} className="size-4" />
        Add step
      </Button>
    </div>
  );
}
