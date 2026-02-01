import * as React from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { TabsContext, useTabs } from "@/components/drawer";

function useMediaQuery(query: string) {
  // Initialize with null to detect SSR/hydration state
  const [matches, setMatches] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const handleChange = () => setMatches(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [query]);

  // Return false during SSR/initial render to avoid flash
  return matches ?? false;
}

interface SplitPaneLayoutProps extends React.ComponentProps<"div"> {
  children: React.ReactNode;
}

export function SplitPaneLayout({
  children,
  className,
  ...props
}: SplitPaneLayoutProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-4 lg:flex-row lg:items-stretch",
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
  children,
  className,
  ...props
}: DetailPanelProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const panelContent = open ? children : (emptyState ?? <DetailEmptyState />);

  return (
    <>
      {isDesktop ? (
        <aside
          className={cn(
            "hidden lg:flex lg:w-[36%] lg:min-w-[320px] lg:max-w-[520px]",
            "flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm",
            className,
          )}
          {...props}
        >
          {panelContent}
        </aside>
      ) : null}
      {!isDesktop ? (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent
            side="right"
            className={cn("w-full p-0", mobileClassName)}
          >
            {(sheetTitle || sheetDescription) && (
              <SheetHeader className="border-b border-border/50 px-6 py-4">
                {sheetTitle && <SheetTitle>{sheetTitle}</SheetTitle>}
                {sheetDescription && (
                  <SheetDescription>{sheetDescription}</SheetDescription>
                )}
              </SheetHeader>
            )}
            <div className={cn("flex-1 overflow-y-auto", bodyClassName)}>
              {children}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
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
        "hover:text-foreground",
        isActive
          ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary"
          : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
