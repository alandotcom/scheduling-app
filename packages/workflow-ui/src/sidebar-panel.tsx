// oxlint-disable eslint-plugin-react/react-in-jsx-scope
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type SidebarPanelProps = {
  activeTab: "properties" | "runs";
  onTabChange: (tab: "properties" | "runs") => void;
  hasRunsTab: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

const MIN_WIDTH = 340;
const MAX_WIDTH_RATIO = 0.46;
const DEFAULT_WIDTH = 430;

export function SidebarPanel({
  activeTab,
  onTabChange,
  hasRunsTab,
  open,
  onOpenChange,
  children,
}: SidebarPanelProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const resizingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      resizingRef.current = true;
      const startX = e.clientX;
      const startWidth = width;
      const maxWidth = window.innerWidth * MAX_WIDTH_RATIO;

      const onMove = (moveEvent: PointerEvent) => {
        const delta = startX - moveEvent.clientX;
        const nextWidth = Math.min(
          maxWidth,
          Math.max(MIN_WIDTH, startWidth + delta),
        );
        setWidth(nextWidth);
      };

      const onUp = () => {
        resizingRef.current = false;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [width],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  return (
    <>
      {/* Toggle when collapsed */}
      {!open ? (
        <button
          type="button"
          className="absolute right-3 top-3 z-10 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-sm"
          onClick={() => onOpenChange(true)}
        >
          Properties
        </button>
      ) : null}

      {/* Edge toggle */}
      <button
        type="button"
        className="absolute top-3 z-30 flex h-10 w-5 items-center justify-center rounded-l-md border border-r-0 border-border bg-card text-muted-foreground hover:text-foreground"
        style={{
          right: open ? width : 0,
          transition: "right 200ms ease",
        }}
        onClick={() => onOpenChange(!open)}
        title={open ? "Close inspector" : "Open inspector"}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d={open ? "M3 1L7 5L3 9" : "M7 1L3 5L7 9"}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Panel */}
      <div
        ref={panelRef}
        className="absolute inset-y-0 right-0 z-20 border-l border-border bg-card transition-transform duration-200"
        style={{
          width,
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Resize handle */}
        <div
          className="group absolute inset-y-0 -left-1 z-40 w-2 cursor-col-resize"
          onPointerDown={handleResizeStart}
        >
          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary/40" />
        </div>

        <div className="flex h-full flex-col">
          {/* Tab switcher */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <div className="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-muted p-[2px]">
              <button
                type="button"
                className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === "properties"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => onTabChange("properties")}
              >
                Properties
              </button>
              {hasRunsTab ? (
                <button
                  type="button"
                  className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    activeTab === "runs"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => onTabChange("runs")}
                >
                  Runs
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => onOpenChange(false)}
              title="Close panel"
            >
              <HugeiconsIcon
                icon={Cancel01Icon}
                className="size-4"
                strokeWidth={2}
              />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-3">{children}</div>
        </div>
      </div>
    </>
  );
}
