import { useReactFlow } from "@xyflow/react";
import {
  Maximize01Icon,
  MinusSignIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export function Controls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div
      data-slot="button-group"
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <Button
        className="rounded-none border-0 border-b border-border hover:bg-secondary"
        onClick={() => zoomIn()}
        size="icon-sm"
        title="Zoom in"
        variant="secondary"
      >
        <Icon icon={PlusSignIcon} className="size-4" />
      </Button>
      <Button
        className="rounded-none border-0 border-b border-border hover:bg-secondary"
        onClick={() => zoomOut()}
        size="icon-sm"
        title="Zoom out"
        variant="secondary"
      >
        <Icon icon={MinusSignIcon} className="size-4" />
      </Button>
      <Button
        className="rounded-none border-0 hover:bg-secondary"
        onClick={() => fitView({ padding: 0.2, duration: 300 })}
        size="icon-sm"
        title="Fit view"
        variant="secondary"
      >
        <Icon icon={Maximize01Icon} className="size-4" />
      </Button>
    </div>
  );
}
