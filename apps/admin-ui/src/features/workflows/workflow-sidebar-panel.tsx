import { useAtom, useSetAtom } from "jotai";
import { ArrowLeft02Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  isSidebarCollapsedAtom,
  rightPanelWidthAtom,
} from "./workflow-editor-store";

const DEFAULT_WIDTH_PERCENT = 34;
const MIN_WIDTH_PERCENT = 26;
const MAX_WIDTH_PERCENT = 50;

const COOKIE_SIDEBAR_WIDTH = "sidebar-width";
const COOKIE_SIDEBAR_COLLAPSED = "sidebar-collapsed";
const SESSION_ENTRY_ANIMATION_FLAG = "workflow-sidebar-entry-animate";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] != null ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
}

function clampWidth(value: number): number {
  return Math.min(MAX_WIDTH_PERCENT, Math.max(MIN_WIDTH_PERCENT, value));
}

interface WorkflowSidebarPanelProps {
  children: React.ReactNode;
}

export function WorkflowSidebarPanel({ children }: WorkflowSidebarPanelProps) {
  const [isCollapsed, setIsCollapsed] = useAtom(isSidebarCollapsedAtom);
  const setRightPanelWidth = useSetAtom(rightPanelWidthAtom);

  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = readCookie(COOKIE_SIDEBAR_WIDTH);
    if (saved) {
      const parsed = Number.parseFloat(saved);
      if (!Number.isNaN(parsed)) return clampWidth(parsed);
    }
    return DEFAULT_WIDTH_PERCENT;
  });

  const [shouldAnimate, setShouldAnimate] = useState(() => {
    try {
      const flag = sessionStorage.getItem(SESSION_ENTRY_ANIMATION_FLAG);
      if (flag) {
        sessionStorage.removeItem(SESSION_ENTRY_ANIMATION_FLAG);
        return true;
      }
    } catch {
      // sessionStorage not available
    }
    return false;
  });

  const [isResizing, setIsResizing] = useState(false);
  const [isResizeHovered, setIsResizeHovered] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Initialize collapsed state from cookie
  useEffect(() => {
    const saved = readCookie(COOKIE_SIDEBAR_COLLAPSED);
    if (saved === "true") {
      setIsCollapsed(true);
    }
  }, [setIsCollapsed]);

  // Sync rightPanelWidthAtom
  useEffect(() => {
    if (isCollapsed) {
      setRightPanelWidth(null);
    } else {
      setRightPanelWidth(`${panelWidth}%`);
    }
  }, [isCollapsed, panelWidth, setRightPanelWidth]);

  // Persist width to cookie
  useEffect(() => {
    writeCookie(COOKIE_SIDEBAR_WIDTH, String(panelWidth));
  }, [panelWidth]);

  // Persist collapsed to cookie
  useEffect(() => {
    writeCookie(COOKIE_SIDEBAR_COLLAPSED, String(isCollapsed));
  }, [isCollapsed]);

  // Clear entry animation after it plays
  useEffect(() => {
    if (!shouldAnimate) return;
    const timer = setTimeout(() => setShouldAnimate(false), 500);
    return () => clearTimeout(timer);
  }, [shouldAnimate]);

  // Cmd+B keyboard shortcut to toggle sidebar
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "b" &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault();
        setIsCollapsed((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setIsCollapsed]);

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, [setIsCollapsed]);

  const handleResizeStart = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      setIsResizing(true);

      const startX = event.clientX;
      const startWidth = panelWidth;
      const containerWidth =
        panelRef.current?.parentElement?.getBoundingClientRect().width ??
        window.innerWidth;

      function onPointerMove(moveEvent: PointerEvent) {
        const deltaX = startX - moveEvent.clientX;
        const deltaPercent = (deltaX / containerWidth) * 100;
        const newWidth = clampWidth(startWidth + deltaPercent);
        setPanelWidth(newWidth);
      }

      function onPointerUp() {
        setIsResizing(false);
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
      }

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [panelWidth],
  );

  return (
    <>
      {/* Expand button - visible when collapsed */}
      {isCollapsed ? (
        <button
          className="absolute top-1/2 right-0 z-20 flex h-8 w-6 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-border bg-background shadow-sm transition-colors hover:bg-muted"
          onClick={handleToggleCollapse}
          title="Expand sidebar (Cmd+B)"
          type="button"
        >
          <Icon icon={ArrowLeft02Icon} className="size-3.5" />
        </button>
      ) : null}

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          "absolute top-0 right-0 z-10 flex h-full flex-col border-l border-border bg-card transition-transform duration-200",
          isCollapsed && "translate-x-full",
          shouldAnimate && !isCollapsed && "animate-in slide-in-from-right",
          isResizing && "select-none transition-none",
        )}
        style={{ width: `${panelWidth}%` }}
      >
        {/* Resize handle */}
        <div
          className="group absolute top-0 left-0 z-20 flex h-full w-1.5 -translate-x-1/2 cursor-col-resize items-center justify-center"
          onPointerDown={handleResizeStart}
          onPointerEnter={() => setIsResizeHovered(true)}
          onPointerLeave={() => {
            if (!isResizing) setIsResizeHovered(false);
          }}
        >
          {/* Blue indicator line */}
          <div
            className={cn(
              "h-full w-px transition-colors",
              isResizeHovered || isResizing ? "bg-blue-500" : "bg-transparent",
            )}
          />

          {/* Collapse button on hover */}
          {isResizeHovered && !isResizing ? (
            <button
              className="absolute top-1/2 left-1/2 z-30 flex h-6 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border border-border bg-background shadow-sm transition-colors hover:bg-muted"
              onClick={(event) => {
                event.stopPropagation();
                handleToggleCollapse();
              }}
              onPointerDown={(event) => event.stopPropagation()}
              title="Collapse sidebar (Cmd+B)"
              type="button"
            >
              <Icon icon={ArrowRight02Icon} className="size-3" />
            </button>
          ) : null}
        </div>

        {/* Panel content */}
        <div className="flex size-full flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </>
  );
}
