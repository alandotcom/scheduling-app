import type { ReactNode } from "react";

import { TableSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface EntityListLoadingStateProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export function EntityListLoadingState({
  rows = 5,
  cols = 5,
  className,
}: EntityListLoadingStateProps) {
  return (
    <div className={cn("py-10", className)} role="status" aria-live="polite">
      <TableSkeleton rows={rows} cols={cols} />
    </div>
  );
}

interface EntityListEmptyStateProps {
  children: ReactNode;
  className?: string;
}

export function EntityListEmptyState({
  children,
  className,
}: EntityListEmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-10 text-center text-muted-foreground shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface EntityMobileCardListProps {
  children: ReactNode;
  className?: string;
}

export function EntityMobileCardList({
  children,
  className,
}: EntityMobileCardListProps) {
  return <div className={cn("space-y-3 md:hidden", className)}>{children}</div>;
}

interface EntityMobileCardProps {
  children: ReactNode;
  onOpen?: () => void;
  className?: string;
}

export function EntityMobileCard({
  children,
  onOpen,
  className,
}: EntityMobileCardProps) {
  const interactive = typeof onOpen === "function";
  return (
    <article
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-sm",
        interactive &&
          "cursor-pointer transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
        className,
      )}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onOpen : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
    >
      {children}
    </article>
  );
}

interface EntityDesktopTableProps {
  children: ReactNode;
  className?: string;
}

export function EntityDesktopTable({
  children,
  className,
}: EntityDesktopTableProps) {
  return (
    <div
      className={cn(
        "hidden overflow-hidden rounded-xl border border-border shadow-sm md:block",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface EntityCardFieldProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function EntityCardField({
  label,
  value,
  className,
}: EntityCardFieldProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}
