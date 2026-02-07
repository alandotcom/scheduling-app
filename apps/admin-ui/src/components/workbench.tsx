import * as React from "react";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { TabsContext, useTabs } from "@/components/ui/tabs-context";

export type DetailMode = "docked" | "overlay" | "fullscreen";

const DOCKED_BREAKPOINT = "(min-width: 1280px)";
const OVERLAY_BREAKPOINT = "(min-width: 768px)";
const DEFAULT_DETAIL_WIDTH = 440;
const MIN_DETAIL_WIDTH = 360;
const MAX_DETAIL_WIDTH = 640;

function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  React.useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const handleChange = () => setMatches(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}

function clampWidth(width: number) {
  return Math.max(MIN_DETAIL_WIDTH, Math.min(MAX_DETAIL_WIDTH, width));
}

function usePersistedDetailWidth(storageKey?: string) {
  const key = storageKey ? `workbench:${storageKey}:detail-width` : null;
  const [width, setWidth] = React.useState(DEFAULT_DETAIL_WIDTH);

  React.useEffect(() => {
    if (!key) return;
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) {
      setWidth(clampWidth(parsed));
    }
  }, [key]);

  const setPersistedWidth = React.useCallback(
    (next: number) => {
      const clamped = clampWidth(next);
      setWidth(clamped);
      if (key) {
        window.localStorage.setItem(key, String(clamped));
      }
    },
    [key],
  );

  return [width, setPersistedWidth] as const;
}

export function useDetailMode(): DetailMode {
  const isDocked = useMediaQuery(DOCKED_BREAKPOINT);
  const isOverlay = useMediaQuery(OVERLAY_BREAKPOINT);
  if (isDocked) return "docked";
  if (isOverlay) return "overlay";
  return "fullscreen";
}

interface WorkbenchLayoutProps extends React.ComponentProps<"div"> {
  children: React.ReactNode;
}

export function WorkbenchLayout({
  children,
  className,
  ...props
}: WorkbenchLayoutProps) {
  return (
    <div
      className={cn(
        "flex flex-1 min-w-0 flex-col gap-4 xl:flex-row",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface ListPanelProps extends React.ComponentProps<"section"> {
  children: React.ReactNode;
}

export function ListPanel({ children, className, ...props }: ListPanelProps) {
  return (
    <section className={cn("min-w-0 flex-1", className)} {...props}>
      {children}
    </section>
  );
}

interface DetailPanelProps extends React.ComponentProps<"aside"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheetTitle?: React.ReactNode;
  sheetDescription?: React.ReactNode;
  emptyState?: React.ReactNode;
  mobileClassName?: string;
  bodyClassName?: string;
  storageKey?: string;
  children: React.ReactNode;
}

export function DetailPanel({
  open,
  onOpenChange,
  sheetTitle,
  sheetDescription,
  emptyState,
  mobileClassName,
  bodyClassName,
  storageKey,
  children,
  className,
  ...props
}: DetailPanelProps) {
  const detailMode = useDetailMode();
  const isDocked = detailMode === "docked";
  const [detailWidth, setDetailWidth] = usePersistedDetailWidth(storageKey);
  const [isDragging, setIsDragging] = React.useState(false);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(detailWidth);
  const panelRef = React.useRef<HTMLElement | null>(null);

  const panelContent = open ? children : (emptyState ?? <DetailEmptyState />);

  React.useEffect(() => {
    if (!isDragging || !isDocked) return;

    const onPointerMove = (event: PointerEvent) => {
      const delta = startXRef.current - event.clientX;
      setDetailWidth(startWidthRef.current + delta);
    };

    const onPointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [isDocked, isDragging, setDetailWidth]);

  if (isDocked) {
    return (
      <aside
        ref={panelRef}
        className={cn(
          "relative hidden xl:flex xl:min-w-[360px] xl:max-w-[640px]",
          "flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm",
          className,
        )}
        style={{ width: `${detailWidth}px` }}
        {...props}
      >
        {open ? (
          <button
            type="button"
            aria-label="Resize detail panel"
            className={cn(
              "absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none",
              "hover:bg-border/60 focus-visible:bg-border/80",
            )}
            onPointerDown={(event) => {
              event.preventDefault();
              startXRef.current = event.clientX;
              startWidthRef.current = detailWidth;
              setIsDragging(true);
            }}
          />
        ) : null}
        {panelContent}
      </aside>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "p-0 touch-manipulation overflow-y-auto overscroll-contain",
          detailMode === "overlay"
            ? "w-[min(92vw,640px)]"
            : "w-screen max-w-none",
          mobileClassName,
        )}
      >
        {(sheetTitle || sheetDescription) && (
          <SheetHeader className="border-b border-border/50 px-6 py-4">
            {sheetTitle && <SheetTitle>{sheetTitle}</SheetTitle>}
            {sheetDescription && (
              <SheetDescription>{sheetDescription}</SheetDescription>
            )}
          </SheetHeader>
        )}
        <SheetClose asChild>
          <Button
            variant="ghost"
            className="absolute top-4 right-4"
            size="icon-sm"
            aria-label="Close details"
          >
            <Icon icon={Cancel01Icon} />
          </Button>
        </SheetClose>
        <div className={cn("flex h-full flex-col", bodyClassName)}>
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailEmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
      Select an item to see details.
    </div>
  );
}

interface DetailTabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function DetailTabs({
  value,
  onValueChange,
  children,
  className,
}: DetailTabsProps) {
  const contextValue = React.useMemo(
    () => ({ value, onValueChange }),
    [value, onValueChange],
  );

  return (
    <TabsContext.Provider value={contextValue}>
      <div
        className={cn("flex gap-1 border-b border-border/50 px-6", className)}
        role="tablist"
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

interface DetailTabProps {
  value: string;
  children: React.ReactNode;
}

export function DetailTab({ value, children }: DetailTabProps) {
  const { value: activeValue, onValueChange } = useTabs();
  const isActive = value === activeValue;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => onValueChange(value)}
      className={cn(
        "relative px-3 py-2.5 text-sm font-medium transition-colors",
        "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none",
        isActive
          ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary"
          : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
