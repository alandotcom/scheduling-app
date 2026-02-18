import { useCallback, useEffect, useRef, useState } from "react";
import type { JourneyMode, JourneyStatus } from "@scheduling/dto";
import {
  Add01Icon,
  ArrowTurnBackwardIcon,
  ArrowTurnForwardIcon,
  Menu01Icon,
  PencilEdit02Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { useReactFlow } from "@xyflow/react";
import { useAtomValue, useSetAtom } from "jotai";
import { Panel } from "@/components/flow-elements/panel";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
const OVERFLOW_VIEWPORT_PADDING = 40;

type ToolbarDensity = "full" | "compact" | "minimal";

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
  const toolbarContainerRef = useRef<HTMLDivElement | null>(null);
  const fullControlsMeasureRef = useRef<HTMLDivElement | null>(null);
  const compactControlsMeasureRef = useRef<HTMLDivElement | null>(null);
  const minimalControlsMeasureRef = useRef<HTMLDivElement | null>(null);

  const hasUnsavedChanges = useAtomValue(workflowEditorHasUnsavedChangesAtom);
  const canUndo = useAtomValue(canUndoAtom);
  const canRedo = useAtomValue(canRedoAtom);
  const [toolbarDensity, setToolbarDensity] = useState<ToolbarDensity>("full");

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

  const measureOverflow = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const container = toolbarContainerRef.current;
    const fullControls = fullControlsMeasureRef.current;
    const compactControls = compactControlsMeasureRef.current;
    const minimalControls = minimalControlsMeasureRef.current;
    if (!container || !fullControls || !compactControls || !minimalControls) {
      return;
    }

    const closestFlowRoot = container.closest(".react-flow");
    const globalFlowRoot = document.querySelector(".react-flow");
    const flowRoot =
      closestFlowRoot instanceof HTMLElement
        ? closestFlowRoot
        : globalFlowRoot instanceof HTMLElement
          ? globalFlowRoot
          : null;
    const flowRect = flowRoot?.getBoundingClientRect() ?? null;
    const availableWidth = Math.max(
      0,
      Math.floor(
        (flowRect?.width ?? window.innerWidth) - OVERFLOW_VIEWPORT_PADDING,
      ),
    );

    const fullControlsWidth = Math.ceil(
      fullControls.getBoundingClientRect().width,
    );
    const compactControlsWidth = Math.ceil(
      compactControls.getBoundingClientRect().width,
    );
    const minimalControlsWidth = Math.ceil(
      minimalControls.getBoundingClientRect().width,
    );

    let nextDensity: ToolbarDensity = "full";
    if (fullControlsWidth > availableWidth) {
      nextDensity = "compact";
    }
    if (compactControlsWidth > availableWidth) {
      nextDensity = "minimal";
    }
    if (minimalControlsWidth > availableWidth) {
      nextDensity = "minimal";
    }

    setToolbarDensity((current) =>
      current === nextDensity ? current : nextDensity,
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const initialMeasureFrame = window.requestAnimationFrame(() => {
      measureOverflow();
    });
    const handleResize = () => {
      measureOverflow();
    };

    window.addEventListener("resize", handleResize);

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        measureOverflow();
      });
      if (toolbarContainerRef.current) {
        observer.observe(toolbarContainerRef.current);
      }
      if (fullControlsMeasureRef.current) {
        observer.observe(fullControlsMeasureRef.current);
      }
      if (compactControlsMeasureRef.current) {
        observer.observe(compactControlsMeasureRef.current);
      }
      if (minimalControlsMeasureRef.current) {
        observer.observe(minimalControlsMeasureRef.current);
      }

      return () => {
        window.cancelAnimationFrame(initialMeasureFrame);
        observer.disconnect();
        window.removeEventListener("resize", handleResize);
      };
    }

    return () => {
      window.cancelAnimationFrame(initialMeasureFrame);
      window.removeEventListener("resize", handleResize);
    };
  }, [measureOverflow]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      measureOverflow();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    canRedo,
    canUndo,
    currentVersion,
    hasUnsavedChanges,
    isPausing,
    isPublishing,
    isRenaming,
    isResuming,
    isSaving,
    isSettingMode,
    journeyMode,
    journeyStatus,
    measureOverflow,
    publishWarnings,
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

  const warningCount = publishWarnings.length;
  const chipClass =
    "inline-flex h-8 items-center rounded-md border px-2.5 text-[0.8rem] font-medium";

  const secondaryInlineControls = (
    <ButtonGroup className="shrink-0">
      <Button
        aria-label="Add step"
        onClick={handleAddStep}
        size="icon-sm"
        variant="outline"
        title="Add step"
      >
        <Icon icon={Add01Icon} />
      </Button>
      <Button
        aria-label="Undo"
        onClick={() => undo()}
        disabled={!canUndo}
        size="icon-sm"
        variant="outline"
        title="Undo"
      >
        <Icon icon={ArrowTurnBackwardIcon} />
      </Button>
      <Button
        aria-label="Redo"
        onClick={() => redo()}
        disabled={!canRedo}
        size="icon-sm"
        variant="outline"
        title="Redo"
      >
        <Icon icon={ArrowTurnForwardIcon} />
      </Button>
      <Button
        aria-label="Rename"
        onClick={onRename}
        disabled={isRenaming}
        size="icon-sm"
        variant="outline"
        title="Rename"
      >
        <Icon icon={PencilEdit02Icon} />
      </Button>
    </ButtonGroup>
  );

  const saveButton = (
    <Button
      onClick={onSave}
      disabled={isSaving || !hasUnsavedChanges}
      size="sm"
      variant="outline"
      className="relative min-w-20 shrink-0 justify-center"
    >
      {isSaving ? <Icon icon={Loading03Icon} className="animate-spin" /> : null}
      Save
      {hasUnsavedChanges && !isSaving && (
        <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" />
      )}
    </Button>
  );

  const statusChip = <div className={chipClass}>{statusLabel}</div>;

  const versionChip = (
    <div className={cn(chipClass, "text-muted-foreground")}>
      {currentVersion ? `Version ${currentVersion}` : "Version -"}
    </div>
  );

  const warningChip = warningCount > 0 && (
    <div
      className={cn(
        chipClass,
        "border-amber-500/50 bg-amber-500/10 text-amber-700",
      )}
    >
      {warningCount} warning{warningCount === 1 ? "" : "s"}
    </div>
  );

  const modeToggle = (
    <div
      className={cn(
        "inline-flex h-8 items-center rounded-md border border-border bg-muted/20 p-0.5",
        journeyMode === "test" && "border-destructive/40 bg-destructive/5",
      )}
    >
      <Button
        className="h-7 px-2"
        disabled={modeDisabled}
        onClick={() => onSetMode("live")}
        size="sm"
        type="button"
        variant={journeyMode === "live" ? "default" : "ghost"}
      >
        Live
      </Button>
      <Button
        className="h-7 px-2"
        disabled={modeDisabled}
        onClick={() => onSetMode("test")}
        size="sm"
        type="button"
        variant={journeyMode === "test" ? "destructive" : "ghost"}
      >
        Test
      </Button>
    </div>
  );

  const primaryButton = (
    <Button
      onClick={primaryAction}
      disabled={isLifecycleBusy}
      size="sm"
      variant={journeyStatus === "draft" ? "default" : "outline"}
      className="min-w-24 shrink-0 justify-center"
    >
      {primaryPending ? (
        <Icon icon={Loading03Icon} className="animate-spin" />
      ) : null}
      {primaryLabel}
    </Button>
  );

  const overflowTrigger = (
    <Button
      size="icon-sm"
      variant="outline"
      type="button"
      title="More actions"
      aria-label="More actions"
    >
      <Icon icon={Menu01Icon} />
      <span className="sr-only">More actions</span>
    </Button>
  );

  const overflowMenu = (includeCoreActions: boolean) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={overflowTrigger} />
      <DropdownMenuContent align="end" sideOffset={6} className="w-64">
        {includeCoreActions ? (
          <>
            <DropdownMenuItem
              disabled={isSaving || !hasUnsavedChanges}
              onClick={onSave}
            >
              Save changes
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={modeDisabled || journeyMode === "live"}
              onClick={() => onSetMode("live")}
            >
              Switch to Live
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={modeDisabled || journeyMode === "test"}
              onClick={() => onSetMode("test")}
            >
              Switch to Test
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onClick={handleAddStep}>Add step</DropdownMenuItem>
        <DropdownMenuItem disabled={!canUndo} onClick={() => undo()}>
          Undo
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canRedo} onClick={() => redo()}>
          Redo
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isRenaming} onClick={onRename}>
          Rename journey
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          {currentVersion ? `Version ${currentVersion}` : "Version -"}
        </DropdownMenuItem>
        {warningCount > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              Publish warnings ({warningCount})
            </DropdownMenuItem>
            {publishWarnings.map((warning) => (
              <DropdownMenuItem
                key={warning}
                disabled
                className="whitespace-normal text-xs leading-snug"
              >
                {warning}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const fullInlineControls = (
    <>
      {secondaryInlineControls}
      {saveButton}
      {statusChip}
      {versionChip}
      {warningChip}
      {modeToggle}
      {primaryButton}
    </>
  );

  const compactInlineControls = (
    <>
      {saveButton}
      {statusChip}
      {modeToggle}
      {primaryButton}
      {overflowMenu(false)}
    </>
  );

  const minimalInlineControls = (
    <>
      {statusChip}
      {primaryButton}
      {overflowMenu(true)}
    </>
  );

  return (
    <Panel position="top-right" className="flex items-center">
      <div
        ref={toolbarContainerRef}
        data-testid="workflow-toolbar-container"
        className="relative"
      >
        <div
          ref={fullControlsMeasureRef}
          data-testid="workflow-toolbar-measure"
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 -z-10 flex w-max items-center gap-1.5 opacity-0"
          style={{ visibility: "hidden" }}
        >
          {fullInlineControls}
        </div>
        <div
          ref={compactControlsMeasureRef}
          data-testid="workflow-toolbar-measure-compact"
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 -z-10 flex w-max items-center gap-1.5 opacity-0"
          style={{ visibility: "hidden" }}
        >
          {saveButton}
          {statusChip}
          {modeToggle}
          {primaryButton}
          {overflowTrigger}
        </div>
        <div
          ref={minimalControlsMeasureRef}
          data-testid="workflow-toolbar-measure-minimal"
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 -z-10 flex w-max items-center gap-1.5 opacity-0"
          style={{ visibility: "hidden" }}
        >
          {statusChip}
          {primaryButton}
          {overflowTrigger}
        </div>

        <div className="flex w-max items-center gap-1.5">
          {toolbarDensity === "full"
            ? fullInlineControls
            : toolbarDensity === "compact"
              ? compactInlineControls
              : minimalInlineControls}
        </div>
      </div>
    </Panel>
  );
}
