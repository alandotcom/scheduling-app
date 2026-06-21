import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface MobileActionBarProps {
  /** The page's primary action (e.g. an "Add client" button), shown full-width. */
  children: ReactNode;
  className?: string;
}

/**
 * Compact-only bottom action bar. Holds the page's primary action in the thumb
 * zone, full-width. Hidden from `lg` up, where the desktop header takes over.
 * The Assistant launcher lives in the top header on every breakpoint, so it is
 * intentionally absent here.
 */
export function MobileActionBar({ children, className }: MobileActionBarProps) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex items-center border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
