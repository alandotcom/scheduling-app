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

export type DetailMode = "overlay" | "fullscreen";

const OVERLAY_BREAKPOINT = "(min-width: 768px)";

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

export function useDetailMode(): DetailMode {
  const isOverlay = useMediaQuery(OVERLAY_BREAKPOINT);
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
    <div className={cn("flex flex-1 min-w-0 flex-col", className)} {...props}>
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
  mobileClassName,
  bodyClassName,
  children,
}: DetailPanelProps) {
  const detailMode = useDetailMode();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          "p-0 touch-manipulation overflow-y-auto overscroll-contain",
          detailMode === "overlay"
            ? "w-[min(92vw,560px)]"
            : "w-screen max-w-none",
          mobileClassName,
        )}
      >
        {(sheetTitle || sheetDescription) && (
          <SheetHeader className="border-b border-border px-6 py-4">
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
        className={cn("flex gap-1 border-b border-border px-6", className)}
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
