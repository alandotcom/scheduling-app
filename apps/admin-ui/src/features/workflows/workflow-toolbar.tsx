import { useCallback } from "react";
import type { JourneyState } from "@scheduling/dto";
import {
  Add01Icon,
  ArrowTurnBackwardIcon,
  ArrowTurnForwardIcon,
  FloppyDiskIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { useReactFlow } from "@xyflow/react";
import { useAtomValue, useSetAtom } from "jotai";
import { Panel } from "@/components/flow-elements/panel";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Icon } from "@/components/ui/icon";
import {
  addWorkflowEditorActionNodeAtom,
  canRedoAtom,
  canUndoAtom,
  propertiesPanelActiveTabAtom,
  redoAtom,
  undoAtom,
  workflowEditorHasUnsavedChangesAtom,
  workflowEditorNodesAtom,
  workflowEditorSelectedNodeIdAtom,
  type WorkflowCanvasNode,
} from "./workflow-editor-store";

interface WorkflowToolbarProps {
  canManageWorkflow: boolean;
  journeyState: JourneyState;
  publishWarnings: string[];
  isSaving: boolean;
  isPublishing: boolean;
  isPausing: boolean;
  isResuming: boolean;
  onSave: () => void;
  onPublish: (mode: "live" | "test") => void;
  onPause: () => void;
  onResume: (targetState: "published" | "test_only") => void;
}

const NODE_WIDTH = 192;
const NODE_HEIGHT = 96;
const OVERLAP_NUDGE = 40;

export function WorkflowToolbar({
  canManageWorkflow,
  journeyState,
  publishWarnings,
  isSaving,
  isPublishing,
  isPausing,
  isResuming,
  onSave,
  onPublish,
  onPause,
  onResume,
}: WorkflowToolbarProps) {
  const { screenToFlowPosition } = useReactFlow();

  const hasUnsavedChanges = useAtomValue(workflowEditorHasUnsavedChangesAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const canRedo = useAtomValue(canRedoAtom);

  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);
  const addActionNode = useSetAtom(addWorkflowEditorActionNodeAtom);
  const setNodes = useSetAtom(workflowEditorNodesAtom);
  const setSelectedNodeId = useSetAtom(workflowEditorSelectedNodeIdAtom);
  const setPropertiesTab = useSetAtom(propertiesPanelActiveTabAtom);

  const handleAddStep = useCallback(() => {
    // Add node at default position (this also pushes undo history)
    addActionNode();

    // Compute viewport center in flow coordinates
    const viewportCenter = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const targetX = viewportCenter.x - NODE_WIDTH / 2;
    const targetY = viewportCenter.y - NODE_HEIGHT / 2;

    // Read current nodes to find the newly added node (last one) and reposition it
    setNodes((currentNodes: WorkflowCanvasNode[]) => {
      if (currentNodes.length === 0) return currentNodes;

      const lastIndex = currentNodes.length - 1;
      const newNode = currentNodes[lastIndex] as WorkflowCanvasNode | undefined;
      if (!newNode) return currentNodes;

      // Nudge diagonally if overlapping with existing nodes
      let finalX = targetX;
      let finalY = targetY;
      let attempts = 0;
      const maxAttempts = 20;

      while (attempts < maxAttempts) {
        const overlaps = currentNodes.some(
          (node, i) =>
            i !== lastIndex &&
            Math.abs(node.position.x - finalX) < NODE_WIDTH &&
            Math.abs(node.position.y - finalY) < NODE_HEIGHT,
        );
        if (!overlaps) break;
        finalX += OVERLAP_NUDGE;
        finalY += OVERLAP_NUDGE;
        attempts++;
      }

      // Select the new node and switch to properties tab
      setSelectedNodeId(newNode.id);
      setPropertiesTab("properties");

      return currentNodes.map((node, i): WorkflowCanvasNode => {
        if (i !== lastIndex) return node;
        return { ...node, position: { x: finalX, y: finalY } };
      });
    });
  }, [
    addActionNode,
    screenToFlowPosition,
    setNodes,
    setSelectedNodeId,
    setPropertiesTab,
  ]);

  if (!canManageWorkflow) {
    return (
      <Panel position="top-right">
        <span className="px-2 py-1 text-xs font-medium text-muted-foreground">
          Read-only
        </span>
      </Panel>
    );
  }

  const lifecycleButtons =
    journeyState === "draft" ? (
      <>
        <Button
          onClick={() => onPublish("live")}
          disabled={isPublishing}
          size="sm"
          variant="default"
        >
          {isPublishing ? (
            <Icon icon={Loading03Icon} className="animate-spin" />
          ) : null}
          Publish
        </Button>
        <Button
          onClick={() => onPublish("test")}
          disabled={isPublishing}
          size="sm"
          variant="outline"
        >
          Publish test-only
        </Button>
      </>
    ) : journeyState === "paused" ? (
      <>
        <Button
          onClick={() => onResume("published")}
          disabled={isResuming}
          size="sm"
          variant="default"
        >
          {isResuming ? (
            <Icon icon={Loading03Icon} className="animate-spin" />
          ) : null}
          Resume live
        </Button>
        <Button
          onClick={() => onResume("test_only")}
          disabled={isResuming}
          size="sm"
          variant="outline"
        >
          Resume test-only
        </Button>
      </>
    ) : (
      <Button
        onClick={onPause}
        disabled={isPausing}
        size="sm"
        variant="outline"
      >
        {isPausing ? (
          <Icon icon={Loading03Icon} className="animate-spin" />
        ) : null}
        Pause
      </Button>
    );

  const stateLabel =
    journeyState === "draft"
      ? "Draft"
      : journeyState === "published"
        ? "Published"
        : journeyState === "paused"
          ? "Paused"
          : "Test-only";

  const actionButtons = (
    <>
      {/* Add Step */}
      <ButtonGroup>
        <Button
          onClick={handleAddStep}
          size="icon-sm"
          variant="outline"
          title="Add step"
        >
          <Icon icon={Add01Icon} />
        </Button>
      </ButtonGroup>

      {/* Undo / Redo */}
      <ButtonGroup>
        <Button
          onClick={() => undo()}
          disabled={!canUndo}
          size="icon-sm"
          variant="outline"
          title="Undo"
        >
          <Icon icon={ArrowTurnBackwardIcon} />
        </Button>
        <Button
          onClick={() => redo()}
          disabled={!canRedo}
          size="icon-sm"
          variant="outline"
          title="Redo"
        >
          <Icon icon={ArrowTurnForwardIcon} />
        </Button>
      </ButtonGroup>

      {/* Save */}
      <ButtonGroup>
        <Button
          onClick={onSave}
          disabled={isSaving || !hasUnsavedChanges}
          size="icon-sm"
          variant="outline"
          title="Save"
          className="relative"
        >
          {isSaving ? (
            <Icon icon={Loading03Icon} className="animate-spin" />
          ) : (
            <Icon icon={FloppyDiskIcon} />
          )}
          {hasUnsavedChanges && !isSaving && (
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
          )}
        </Button>
      </ButtonGroup>

      <div className="rounded-md border px-2 py-1 font-medium text-xs">
        {stateLabel}
      </div>

      <ButtonGroup>{lifecycleButtons}</ButtonGroup>

      {publishWarnings.length > 0 ? (
        <div className="max-w-96 rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-[11px]">
          <p className="font-medium">Publish warnings</p>
          <ul className="mt-1 space-y-0.5">
            {publishWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );

  return (
    <Panel position="top-right" className="flex items-center gap-1.5">
      {/* Desktop: horizontal layout */}
      <div className="hidden items-center gap-1.5 lg:flex">{actionButtons}</div>

      {/* Mobile: vertical layout */}
      <div className="flex flex-col items-end gap-1.5 lg:hidden">
        {actionButtons}
      </div>
    </Panel>
  );
}
