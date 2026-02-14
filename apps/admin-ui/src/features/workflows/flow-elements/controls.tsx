import { useReactFlow } from "@xyflow/react";
import {
  MinusSignIcon,
  PlusSignIcon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

type WorkflowControlsProps = {
  showMinimap: boolean;
  onToggleMinimap: () => void;
};

export function Controls({
  showMinimap,
  onToggleMinimap,
}: WorkflowControlsProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <ButtonGroup orientation="vertical">
      <Button
        className="border"
        onClick={() => zoomIn()}
        size="icon-sm"
        title="Zoom in"
        variant="secondary"
      >
        <Icon icon={PlusSignIcon} className="size-4" />
      </Button>
      <Button
        className="border"
        onClick={() => zoomOut()}
        size="icon-sm"
        title="Zoom out"
        variant="secondary"
      >
        <Icon icon={MinusSignIcon} className="size-4" />
      </Button>
      <Button
        className="border"
        onClick={() => fitView({ padding: 0.2, duration: 250 })}
        size="icon-sm"
        title="Fit view"
        variant="secondary"
      >
        <Icon icon={ViewIcon} className="size-4" />
      </Button>
      <Button
        className="border"
        onClick={onToggleMinimap}
        size="icon-sm"
        title={showMinimap ? "Hide minimap" : "Show minimap"}
        variant="secondary"
      >
        <Icon
          icon={showMinimap ? ViewOffSlashIcon : ViewIcon}
          className="size-4"
        />
      </Button>
    </ButtonGroup>
  );
}
