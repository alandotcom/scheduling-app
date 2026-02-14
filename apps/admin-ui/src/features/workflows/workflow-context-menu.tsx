import type { Edge, Node as FlowNode, XYPosition } from "@xyflow/react";
import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { useCallback, useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type ContextMenuType = "node" | "edge" | "pane" | null;

export type ContextMenuState = {
  type: ContextMenuType;
  position: { x: number; y: number };
  flowPosition?: XYPosition;
  nodeId?: string;
  edgeId?: string;
} | null;

type WorkflowContextMenuProps = {
  menuState: ContextMenuState;
  isTriggerNode: (nodeId: string) => boolean;
  onAddStep: (position: XYPosition) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onClose: () => void;
};

export function WorkflowContextMenu({
  menuState,
  isTriggerNode,
  onAddStep,
  onDeleteNode,
  onDeleteEdge,
  onClose,
}: WorkflowContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuState) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!(event.target instanceof globalThis.Node)) {
        return;
      }
      if (menuRef.current && !menuRef.current.contains(event.target)) {
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

  if (!menuState) {
    return null;
  }

  return (
    <div
      className="fixed z-50 min-w-[10rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      ref={menuRef}
      style={{ left: menuState.position.x, top: menuState.position.y }}
    >
      {menuState.type === "pane" && menuState.flowPosition ? (
        <MenuItem
          icon={Add01Icon}
          label="Add step"
          onClick={() => {
            onAddStep(menuState.flowPosition!);
            onClose();
          }}
        />
      ) : null}

      {menuState.type === "node" && menuState.nodeId ? (
        <MenuItem
          disabled={isTriggerNode(menuState.nodeId)}
          icon={Delete01Icon}
          label="Delete step"
          onClick={() => {
            onDeleteNode(menuState.nodeId!);
            onClose();
          }}
          variant="destructive"
        />
      ) : null}

      {menuState.type === "edge" && menuState.edgeId ? (
        <MenuItem
          icon={Delete01Icon}
          label="Delete connection"
          onClick={() => {
            onDeleteEdge(menuState.edgeId!);
            onClose();
          }}
          variant="destructive"
        />
      ) : null}
    </div>
  );
}

type MenuItemProps = {
  icon: IconSvgElement;
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
};

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
        "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
        "hover:bg-accent hover:text-accent-foreground",
        variant === "destructive" &&
          "text-destructive hover:bg-destructive/10 hover:text-destructive",
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

export function useContextMenuHandlers(
  screenToFlowPosition: (position: { x: number; y: number }) => XYPosition,
  setMenuState: (state: ContextMenuState) => void,
) {
  const onNodeContextMenu = useCallback(
    (event: ReactMouseEvent, node: FlowNode) => {
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
    (event: ReactMouseEvent, edge: Edge) => {
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
    (event: MouseEvent | ReactMouseEvent) => {
      event.preventDefault();
      setMenuState({
        type: "pane",
        position: { x: event.clientX, y: event.clientY },
        flowPosition: screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        }),
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
