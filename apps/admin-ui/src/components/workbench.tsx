import * as React from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { TabsContext, useTabs } from "@/components/ui/tabs-context";

export type DetailMode = "inline";

export function useDetailMode(): DetailMode {
  return "inline";
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
  bodyClassName,
  children,
}: DetailPanelProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background animate-in fade-in-0 duration-200">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onOpenChange(false)}
          className="gap-1.5"
          aria-label="Back to list"
        >
          <Icon icon={ArrowLeft02Icon} />
          <span className="hidden sm:inline">Back</span>
        </Button>

        {(sheetTitle || sheetDescription) && (
          <div className="min-w-0 flex-1">
            {sheetTitle && (
              <h2 className="truncate text-base font-semibold tracking-tight text-foreground">
                {sheetTitle}
              </h2>
            )}
            {sheetDescription && (
              <p className="truncate text-xs text-muted-foreground">
                {sheetDescription}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          "flex-1 overflow-y-auto overscroll-contain",
          bodyClassName,
        )}
      >
        {children}
      </div>
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
