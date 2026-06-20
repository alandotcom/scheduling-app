import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageScaffoldProps extends ComponentProps<"section"> {
  children: ReactNode;
  /**
   * Fill the viewport height instead of growing with content. Use for list
   * pages whose table scrolls internally, so the page itself doesn't scroll
   * and pagination stays pinned in view.
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
        fullHeight
          ? "pb-4 md:flex md:h-full md:min-h-0 md:flex-col"
          : "pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}
