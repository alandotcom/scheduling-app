import { Alert02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { PageScaffold } from "@/components/layout/page-scaffold";

interface RouteErrorComponentProps {
  error: Error;
  reset?: () => void;
}

/** Default route error boundary — caught render/loader errors land here. */
export function RouteErrorComponent({
  error,
  reset,
}: RouteErrorComponentProps) {
  return (
    <PageScaffold>
      <div className="mx-auto mt-12 flex max-w-md flex-col items-center rounded-xl border border-border bg-card px-6 py-14 text-center shadow-sm">
        <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive ring-1 ring-destructive/20">
          <Icon icon={Alert02Icon} className="size-6" />
        </span>
        <h2 className="text-base font-semibold text-foreground">
          Something went wrong
        </h2>
        <p className="mt-1.5 max-w-sm text-sm text-balance text-muted-foreground">
          This page hit an unexpected error. Try again, or head back to the
          dashboard.
        </p>
        {import.meta.env.DEV && error?.message ? (
          <pre className="mt-3 max-w-full overflow-x-auto rounded-md bg-muted px-3 py-2 text-left text-xs text-muted-foreground">
            {error.message}
          </pre>
        ) : null}
        <div className="mt-5 flex items-center gap-2">
          {reset ? (
            <Button type="button" variant="outline" onClick={reset}>
              Try again
            </Button>
          ) : null}
          <Link to="/" className={buttonVariants({ variant: "default" })}>
            Go to dashboard
          </Link>
        </div>
      </div>
    </PageScaffold>
  );
}

/** Default pending UI shown while a route's loader resolves. */
export function RoutePendingComponent() {
  return (
    <PageScaffold>
      <div className="mt-6 space-y-4" role="status" aria-live="polite">
        <span className="sr-only">Loading…</span>
        <Skeleton className="h-8 w-44" />
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </PageScaffold>
  );
}

/** Default not-found UI for unmatched routes. */
export function RouteNotFoundComponent() {
  return (
    <PageScaffold>
      <div className="mx-auto mt-12 flex max-w-md flex-col items-center rounded-xl border border-border bg-card px-6 py-14 text-center shadow-sm">
        <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground/70 ring-1 ring-border/60">
          <Icon icon={Search01Icon} className="size-6" />
        </span>
        <h2 className="text-base font-semibold text-foreground">
          Page not found
        </h2>
        <p className="mt-1.5 max-w-sm text-sm text-balance text-muted-foreground">
          We couldn't find what you were looking for. It may have moved or no
          longer exists.
        </p>
        <Link
          to="/"
          className={buttonVariants({ variant: "default", className: "mt-5" })}
        >
          Go to dashboard
        </Link>
      </div>
    </PageScaffold>
  );
}
