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

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground sm:truncate">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
