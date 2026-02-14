import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/workflows/$workflowId")({
  component: WorkflowEditorRemovedRoute,
});

function WorkflowEditorRemovedRoute() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Workflow Editor Removed</h1>
      <p className="text-muted-foreground text-sm">
        This workflow editor UI has been removed.
      </p>
      <div>
        <Button asChild>
          <Link to="/workflows">Back to workflows</Link>
        </Button>
      </div>
    </div>
  );
}
