// Context menu wrapper for right-click actions

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

export interface ContextMenuItem {
  label: string;
  icon?: React.ComponentProps<typeof Icon>["icon"];
  onClick: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  children: React.ReactElement<{
    onContextMenu?: (e: React.MouseEvent) => void;
  }>;
}

export function ContextMenu({ children, items }: ContextMenuProps) {
  const [position, setPosition] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPosition({ x: e.clientX, y: e.clientY });
    setIsOpen(true);
  }, []);

  const handleClose = React.useCallback(() => {
    setIsOpen(false);
    setPosition(null);
  }, []);

  // Close on click outside
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target;
      if (
        menuRef.current &&
        (!(target instanceof Node) || !menuRef.current.contains(target))
      ) {
        handleClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    const handleScroll = () => {
      handleClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen, handleClose]);

  // Adjust position if menu would go off screen
  const adjustedPosition = React.useMemo(() => {
    if (!position || !isOpen) return position;

    const menuWidth = 192; // min-w-48 = 12rem = 192px
    const menuHeight = items.length * 40; // Approximate height
    const padding = 8;

    let { x, y } = position;

    if (x + menuWidth + padding > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }

    if (y + menuHeight + padding > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }

    return { x, y };
  }, [position, isOpen, items.length]);

  const itemsWithKeys = React.useMemo(() => {
    const seenKeys = new Map<string, number>();
    return items.map((item) => {
      const baseKey = `${item.label}:${item.variant ?? "default"}:${item.separator ? "separator" : "item"}`;
      const count = (seenKeys.get(baseKey) ?? 0) + 1;
      seenKeys.set(baseKey, count);
      return {
        item,
        key: count === 1 ? baseKey : `${baseKey}:${count}`,
      };
    });
  }, [items]);

  return (
    <>
      {React.cloneElement(children, {
        onContextMenu: handleContextMenu,
      })}
      {isOpen &&
        adjustedPosition &&
        createPortal(
          <div
            ref={menuRef}
            className={cn(
              "fixed z-50 min-w-48 overflow-hidden rounded-lg border border-border bg-background p-1 shadow-lg",
              "animate-in fade-in-0 zoom-in-95 duration-100",
            )}
            style={{ top: adjustedPosition.y, left: adjustedPosition.x }}
          >
            {itemsWithKeys.map(({ item, key }, itemIndex) => (
              <React.Fragment key={key}>
                {item.separator && itemIndex > 0 && (
                  <div className="my-1 h-px bg-border/50" />
                )}
                <button
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    item.onClick();
                    handleClose();
                  }}
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none",
                    "transition-colors hover:bg-accent hover:text-accent-foreground",
                    "disabled:pointer-events-none disabled:opacity-50",
                    item.variant === "destructive" &&
                      "text-destructive hover:bg-destructive/10 hover:text-destructive",
                  )}
                >
                  {item.icon && <Icon icon={item.icon} className="size-4" />}
                  {item.label}
                </button>
              </React.Fragment>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
