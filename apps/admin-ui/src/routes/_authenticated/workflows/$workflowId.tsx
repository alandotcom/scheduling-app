import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageScaffold } from "@/components/layout/page-scaffold";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

function WorkflowDetailPage() {
  const { workflowId } = Route.useParams();

  return (
    <PageScaffold>
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/workflows">
              <Icon icon={ArrowLeft01Icon} className="size-4" />
              Back
            </Link>
          </Button>
        </div>

        <section className="rounded-xl border border-border bg-card p-6">
          <h1 className="text-xl font-semibold">
            Workflow editor reset in progress
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The previous editor implementation has been removed. This screen is
            a temporary placeholder while the new workflow UX is rebuilt from
            first principles.
          </p>
          <div className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Workflow ID:{" "}
            <code className="font-mono text-foreground">{workflowId}</code>
          </div>
        </section>
      </div>
    </PageScaffold>
  );
}

export const Route = createFileRoute("/_authenticated/workflows/$workflowId")({
  component: WorkflowDetailPage,
});
