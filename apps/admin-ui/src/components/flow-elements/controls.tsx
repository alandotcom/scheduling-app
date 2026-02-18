import {
  Maximize02Icon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useReactFlow } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

type ControlsProps = {
  onReflow?: () => void;
  canReflow?: boolean;
};

export const Controls = ({ onReflow, canReflow = true }: ControlsProps) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const handleZoomIn = () => {
    zoomIn();
  };

  const handleZoomOut = () => {
    zoomOut();
  };

  const handleFitView = () => {
    fitView({ padding: 0.2, duration: 300 });
  };

  return (
    <ButtonGroup orientation="horizontal">
      <Button
        className="border hover:bg-secondary disabled:opacity-100 disabled:[&>svg]:text-muted-foreground"
        onClick={handleZoomIn}
        size="icon"
        title="Zoom in"
        variant="secondary"
      >
        <Icon icon={ZoomInAreaIcon} className="size-4" />
      </Button>
      <Button
        className="border hover:bg-secondary disabled:opacity-100 disabled:[&>svg]:text-muted-foreground"
        onClick={handleZoomOut}
        size="icon"
        title="Zoom out"
        variant="secondary"
      >
        <Icon icon={ZoomOutAreaIcon} className="size-4" />
      </Button>
      <Button
        className="border hover:bg-secondary disabled:opacity-100 disabled:[&>svg]:text-muted-foreground"
        onClick={handleFitView}
        size="icon"
        title="Fit view"
        variant="secondary"
      >
        <Icon icon={Maximize02Icon} className="size-4" />
      </Button>
      {onReflow ? (
        <Button
          className="border hover:bg-secondary"
          disabled={!canReflow}
          onClick={onReflow}
          size="sm"
          title="Reflow nodes"
          variant="secondary"
        >
          Reflow
        </Button>
      ) : null}
    </ButtonGroup>
  );
};
