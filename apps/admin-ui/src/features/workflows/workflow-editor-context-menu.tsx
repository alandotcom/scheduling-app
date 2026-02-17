import type { Edge, Node, XYPosition } from "@xyflow/react";
import { useAtomValue, useSetAtom } from "jotai";
import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import {
  addInitialTriggerNodeAtom,
  addWorkflowEditorNodeAtom,
  deleteEdgeAtom,
  deleteNodeAtom,
  isSidebarCollapsedAtom,
  propertiesPanelActiveTabAtom,
  workflowEditorNodesAtom,
  type WorkflowCanvasNode,
} from "./workflow-editor-store";

type ContextMenuType = "node" | "edge" | "pane" | null;

export type ContextMenuState = {
  type: ContextMenuType;
  position: { x: number; y: number };
  flowPosition?: XYPosition;
  nodeId?: string;
  edgeId?: string;
} | null;

type DeleteTarget =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | null;

interface WorkflowEditorContextMenuProps {
  menuState: ContextMenuState;
  onClose: () => void;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getNodeType(node: WorkflowCanvasNode | undefined): string | null {
  const nodeData = toRecord(node?.data);
  return typeof nodeData?.type === "string" ? nodeData.type : null;
}

function getNodeLabel(node: WorkflowCanvasNode | undefined): string {
  const nodeData = toRecord(node?.data);
  return typeof nodeData?.label === "string" && nodeData.label.trim().length > 0
    ? nodeData.label
    : "Step";
}

export function WorkflowEditorContextMenu({
  menuState,
  onClose,
}: WorkflowEditorContextMenuProps) {
  const nodes = useAtomValue(workflowEditorNodesAtom);
  const deleteNode = useSetAtom(deleteNodeAtom);
  const deleteEdge = useSetAtom(deleteEdgeAtom);
  const addNode = useSetAtom(addWorkflowEditorNodeAtom);
  const addInitialTrigger = useSetAtom(addInitialTriggerNodeAtom);
  const setSidebarCollapsed = useSetAtom(isSidebarCollapsedAtom);
  const setPropertiesPanelTab = useSetAtom(propertiesPanelActiveTabAtom);

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedNode = menuState?.nodeId
    ? nodes.find((node) => node.id === menuState.nodeId)
    : undefined;
  const isTriggerNode = getNodeType(selectedNode) === "trigger";
  const hasRealNodes = nodes.length > 0;

  const closeDeleteDialog = useCallback(
    (open: boolean) => {
      if (!open) {
        setDeleteTarget(null);
      }
    },
    [setDeleteTarget],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;

    if (deleteTarget.type === "node") {
      deleteNode(deleteTarget.id);
    } else {
      deleteEdge(deleteTarget.id);
    }
    setDeleteTarget(null);
  }, [deleteEdge, deleteNode, deleteTarget]);

  const handleDeleteNode = useCallback(() => {
    if (!menuState?.nodeId || isTriggerNode) return;
    setDeleteTarget({ type: "node", id: menuState.nodeId });
    onClose();
  }, [isTriggerNode, menuState?.nodeId, onClose]);

  const handleDeleteEdge = useCallback(() => {
    if (!menuState?.edgeId) return;
    setDeleteTarget({ type: "edge", id: menuState.edgeId });
    onClose();
  }, [menuState?.edgeId, onClose]);

  const handleAddAction = useCallback(() => {
    if (!menuState?.flowPosition) return;

    const newNode: WorkflowCanvasNode = {
      id: nanoid(),
      type: "action",
      position: {
        x: menuState.flowPosition.x - 96,
        y: menuState.flowPosition.y - 96,
      },
      data: {
        type: "action",
        label: "Action",
        status: "idle",
        config: {},
      },
    };

    addNode(newNode);
    setPropertiesPanelTab("properties");
    setSidebarCollapsed(false);
    onClose();
  }, [
    addNode,
    menuState?.flowPosition,
    onClose,
    setPropertiesPanelTab,
    setSidebarCollapsed,
  ]);

  const handleAddTrigger = useCallback(() => {
    addInitialTrigger();
    setPropertiesPanelTab("properties");
    setSidebarCollapsed(false);
    onClose();
  }, [addInitialTrigger, onClose, setPropertiesPanelTab, setSidebarCollapsed]);

  useEffect(() => {
    if (!menuState) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof globalThis.Node)) {
        onClose();
        return;
      }

      if (menuRef.current && !menuRef.current.contains(target)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuState, onClose]);

  return (
    <>
      {menuState ? (
        <div
          className="fade-in-0 zoom-in-95 fixed z-50 min-w-[10rem] animate-in overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          ref={menuRef}
          style={{ left: menuState.position.x, top: menuState.position.y }}
        >
          {menuState.type === "node" ? (
            <MenuItem
              disabled={isTriggerNode}
              icon={Delete01Icon}
              label={`Delete ${getNodeLabel(selectedNode)}`}
              onClick={handleDeleteNode}
              variant="destructive"
            />
          ) : null}

          {menuState.type === "edge" ? (
            <MenuItem
              icon={Delete01Icon}
              label="Delete edge"
              onClick={handleDeleteEdge}
              variant="destructive"
            />
          ) : null}

          {menuState.type === "pane" ? (
            hasRealNodes ? (
              <MenuItem
                icon={Add01Icon}
                label="Add action"
                onClick={handleAddAction}
              />
            ) : (
              <MenuItem
                icon={Add01Icon}
                label="Add trigger"
                onClick={handleAddTrigger}
              />
            )
          ) : null}
        </div>
      ) : null}

      <DeleteConfirmDialog
        description="Are you sure you want to delete this action node? This will also remove all connected edges. This action cannot be undone."
        onConfirm={handleConfirmDelete}
        onOpenChange={closeDeleteDialog}
        open={deleteTarget?.type === "node"}
        title="Delete action node"
      />

      <DeleteConfirmDialog
        description="Are you sure you want to delete this connection? This action cannot be undone."
        onConfirm={handleConfirmDelete}
        onOpenChange={closeDeleteDialog}
        open={deleteTarget?.type === "edge"}
        title="Delete edge"
      />
    </>
  );
}

interface MenuItemProps {
  icon: IconSvgElement;
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
}

function MenuItem({
  icon,
  label,
  onClick,
  variant = "default",
  disabled,
}: MenuItemProps) {
  return (
    <button
      className={cn(
        "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none",
        "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
        variant === "destructive" &&
          "text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive",
        disabled && "pointer-events-none opacity-50",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon icon={icon} className="size-4" />
      {label}
    </button>
  );
}

export function useWorkflowEditorContextMenuHandlers(
  screenToFlowPosition: (position: { x: number; y: number }) => XYPosition,
  setMenuState: (state: ContextMenuState) => void,
) {
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setMenuState({
        type: "node",
        position: { x: event.clientX, y: event.clientY },
        nodeId: node.id,
      });
    },
    [setMenuState],
  );

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setMenuState({
        type: "edge",
        position: { x: event.clientX, y: event.clientY },
        edgeId: edge.id,
      });
    },
    [setMenuState],
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const flowPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setMenuState({
        type: "pane",
        position: { x: event.clientX, y: event.clientY },
        flowPosition,
      });
    },
    [screenToFlowPosition, setMenuState],
  );

  return {
    onNodeContextMenu,
    onEdgeContextMenu,
    onPaneContextMenu,
  };
}
