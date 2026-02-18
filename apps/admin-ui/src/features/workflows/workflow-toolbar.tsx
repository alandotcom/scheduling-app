import { useCallback } from "react";
import type { JourneyMode, JourneyStatus } from "@scheduling/dto";
import {
  Add01Icon,
  ArrowTurnBackwardIcon,
  ArrowTurnForwardIcon,
  PencilEdit02Icon,
  FloppyDiskIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { useReactFlow } from "@xyflow/react";
import { useAtomValue, useSetAtom } from "jotai";
import { Panel } from "@/components/flow-elements/panel";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
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
  journeyStatus: JourneyStatus;
  journeyMode: JourneyMode;
  currentVersion: number | null;
  publishWarnings: string[];
  isSaving: boolean;
  isPublishing: boolean;
  isPausing: boolean;
  isResuming: boolean;
  isSettingMode: boolean;
  isRenaming: boolean;
  onSave: () => void;
  onRename: () => void;
  onPublish: (mode: JourneyMode) => void;
  onPause: () => void;
  onResume: () => void;
  onSetMode: (mode: JourneyMode) => void;
}

const NODE_WIDTH = 176;
const NODE_HEIGHT = 88;
const OVERLAP_NUDGE = 40;

export function WorkflowToolbar({
  canManageWorkflow,
  journeyStatus,
  journeyMode,
  currentVersion,
  publishWarnings,
  isSaving,
  isPublishing,
  isPausing,
  isResuming,
  isSettingMode,
  isRenaming,
  onSave,
  onRename,
  onPublish,
  onPause,
  onResume,
  onSetMode,
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
    addActionNode();

    const viewportCenter = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const targetX = viewportCenter.x - NODE_WIDTH / 2;
    const targetY = viewportCenter.y - NODE_HEIGHT / 2;

    setNodes((currentNodes: WorkflowCanvasNode[]) => {
      if (currentNodes.length === 0) return currentNodes;

      const lastIndex = currentNodes.length - 1;
      const newNode = currentNodes[lastIndex] as WorkflowCanvasNode | undefined;
      if (!newNode) return currentNodes;

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

  const isLifecycleBusy =
    isPublishing || isPausing || isResuming || isSettingMode;
  const modeDisabled = isLifecycleBusy || journeyStatus !== "published";
  const statusLabel =
    journeyStatus === "draft"
      ? "Draft"
      : journeyStatus === "published"
        ? "Published"
        : "Paused";

  const primaryLabel =
    journeyStatus === "draft"
      ? "Publish"
      : journeyStatus === "paused"
        ? "Resume"
        : "Pause";

  const primaryAction =
    journeyStatus === "draft"
      ? () => onPublish(journeyMode)
      : journeyStatus === "paused"
        ? onResume
        : onPause;

  const primaryPending =
    (journeyStatus === "draft" && isPublishing) ||
    (journeyStatus === "paused" && isResuming) ||
    (journeyStatus === "published" && isPausing);

  const actionButtons = (
    <>
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

      <ButtonGroup>
        <Button
          onClick={onRename}
          disabled={isRenaming}
          size="icon-sm"
          variant="outline"
          title="Rename"
        >
          <Icon icon={PencilEdit02Icon} />
        </Button>
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
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
          )}
        </Button>
      </ButtonGroup>

      <div className="rounded-md border px-2 py-1 font-medium text-xs">
        {statusLabel}
      </div>
      <div className="rounded-md border px-2 py-1 font-medium text-xs text-muted-foreground">
        {currentVersion ? `Version ${currentVersion}` : "Version -"}
      </div>

      <div
        className={cn(
          "inline-flex items-center rounded-md border border-border bg-muted/20 p-0.5",
          journeyMode === "test" && "border-destructive/40 bg-destructive/5",
        )}
      >
        <Button
          className="h-8 px-2"
          disabled={modeDisabled}
          onClick={() => onSetMode("live")}
          size="sm"
          type="button"
          variant={journeyMode === "live" ? "default" : "ghost"}
        >
          Live
        </Button>
        <Button
          className="h-8 px-2"
          disabled={modeDisabled}
          onClick={() => onSetMode("test")}
          size="sm"
          type="button"
          variant={journeyMode === "test" ? "destructive" : "ghost"}
        >
          Test
        </Button>
      </div>

      <ButtonGroup>
        <Button
          onClick={primaryAction}
          disabled={isLifecycleBusy}
          size="sm"
          variant={journeyStatus === "draft" ? "default" : "outline"}
          className="min-w-24 justify-center"
        >
          {primaryPending ? (
            <Icon icon={Loading03Icon} className="animate-spin" />
          ) : null}
          {primaryLabel}
        </Button>
      </ButtonGroup>

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
      <div className="hidden items-center gap-1.5 2xl:flex">
        {actionButtons}
      </div>
      <div className="flex max-w-[min(92vw,34rem)] flex-wrap items-center justify-end gap-1.5 2xl:hidden">
        {actionButtons}
      </div>
    </Panel>
  );
}
