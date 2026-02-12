import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageScaffoldProps extends ComponentProps<"section"> {
  children: ReactNode;
}

export function PageScaffold({
  children,
  className,
  ...props
}: PageScaffoldProps) {
  return (
    <section
      className={cn(
        "mx-auto w-full max-w-7xl px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}
