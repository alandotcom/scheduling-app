import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageScaffoldProps extends ComponentProps<"section"> {
  children: ReactNode;
  /**
   * Fill the viewport height instead of growing with content. Use for list
   * pages whose table scrolls internally, so the page itself doesn't scroll
   * and pagination stays pinned in view. Only applies from `lg` up, where the
   * desktop table renders; below `lg` the page scrolls normally with the
   * compact card layout.
   */
  fullHeight?: boolean;
}

export function PageScaffold({
  children,
  className,
  fullHeight = false,
  ...props
}: PageScaffoldProps) {
  return (
    <section
      className={cn(
        "mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8",
        // Below `lg`, the compact card layout scrolls normally and needs room
        // to clear the fixed MobileActionBar; from `lg` up the desktop layout
        // takes over (full-height internal scroll when fullHeight).
        fullHeight
          ? "pb-24 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:pb-4"
          : "pb-24 lg:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}
