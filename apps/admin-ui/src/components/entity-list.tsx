import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
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
  actionLabel?: string;
  onAction?: () => void;
  icon?: ComponentProps<typeof Icon>["icon"];
}

export function EntityListEmptyState({
  children,
  className,
  actionLabel,
  onAction,
  icon,
}: EntityListEmptyStateProps) {
  const showCreateAction =
    typeof onAction === "function" && typeof actionLabel === "string";

  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-border bg-card px-6 py-14 text-center shadow-sm",
        className,
      )}
    >
      {icon ? (
        <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground/70 ring-1 ring-border/60">
          <Icon icon={icon} className="size-6" />
        </span>
      ) : null}
      <div className="max-w-sm text-sm text-balance text-muted-foreground">
        {children}
      </div>
      {showCreateAction ? (
        <Button
          type="button"
          variant="outline"
          onClick={onAction}
          className="mt-5"
        >
          {actionLabel}
        </Button>
      ) : null}
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
        "hidden min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm md:flex md:flex-1",
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
