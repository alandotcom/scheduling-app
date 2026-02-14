import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/workflows/")({
  component: WorkflowsRemovedRoute,
});

function WorkflowsRemovedRoute() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Workflows Removed</h1>
      <p className="text-muted-foreground text-sm">
        The workflow UI has been removed from this app.
      </p>
      <div>
        <Button asChild>
          <Link to="/">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
