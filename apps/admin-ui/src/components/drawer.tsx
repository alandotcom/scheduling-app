// Reusable drawer component for slide-out panels

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TabsContext, useTabs } from "@/components/ui/tabs-context";

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Drawer({ open, onOpenChange, children }: DrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

interface DrawerContentProps {
  children: React.ReactNode;
  className?: string;
  width?: "sm" | "md" | "lg" | "xl";
}

const widthClasses = {
  sm: "w-full max-w-sm",
  md: "w-full max-w-md",
  lg: "w-full max-w-lg",
  xl: "w-full max-w-xl",
};

export function DrawerContent({
  children,
  className,
  width = "md",
}: DrawerContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn(
          "fixed inset-0 z-50 bg-black/15 md:backdrop-blur-sm",
          "data-open:animate-in data-closed:animate-out",
          "data-closed:fade-out-0 data-open:fade-in-0",
          "duration-150",
        )}
      />
      <DialogPrimitive.Popup
        data-slot="drawer-content"
        className={cn(
          "fixed inset-y-0 right-0 z-50 h-full border-l border-border bg-background shadow-xl",
          "data-open:animate-in data-closed:animate-out",
          "data-closed:slide-out-to-right-10 data-open:slide-in-from-right-10",
          "data-closed:fade-out-0 data-open:fade-in-0",
          "duration-200 ease-in-out",
          "flex flex-col",
          widthClasses[width],
          className,
        )}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

interface DrawerHeaderProps {
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
}

export function DrawerHeader({
  children,
  className,
  onClose,
}: DrawerHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-border px-6 py-4",
        className,
      )}
    >
      <div className="flex-1">{children}</div>
      {onClose && (
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <Icon icon={Cancel01Icon} />
          <span className="sr-only">Close</span>
        </Button>
      )}
    </div>
  );
}

interface DrawerTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function DrawerTitle({ children, className }: DrawerTitleProps) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-medium tracking-tight", className)}
    >
      {children}
    </DialogPrimitive.Title>
  );
}

interface DrawerDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function DrawerDescription({
  children,
  className,
}: DrawerDescriptionProps) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
    >
      {children}
    </DialogPrimitive.Description>
  );
}

interface DrawerBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function DrawerBody({ children, className }: DrawerBodyProps) {
  return (
    <div className={cn("flex-1 overflow-y-auto px-6 py-4", className)}>
      {children}
    </div>
  );
}

interface DrawerFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function DrawerFooter({ children, className }: DrawerFooterProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-border px-6 py-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

// Tabs within drawer
interface DrawerTabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function DrawerTabs({
  value,
  onValueChange,
  children,
  className,
}: DrawerTabsProps) {
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

interface DrawerTabProps {
  value: string;
  children: React.ReactNode;
}

export function DrawerTab({ value, children }: DrawerTabProps) {
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
