import { Add01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import type { WorkflowListResponse } from "@scheduling/dto";
import {
  EntityListEmptyState,
  EntityListLoadingState,
} from "@/components/entity-list";
import { PageScaffold } from "@/components/layout/page-scaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { formatDisplayDateTime } from "@/lib/date-utils";

type OrgRole = "owner" | "admin" | "member" | null | undefined;

export function canManageWorkflowsForRole(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

interface WorkflowListPageProps {
  workflows: WorkflowListResponse;
  isLoading: boolean;
  errorMessage?: string | null;
  canManageWorkflows: boolean;
}

function toVisibilityBadgeVariant(
  visibility: "private" | "public",
): "default" | "secondary" {
  return visibility === "public" ? "default" : "secondary";
}

export function WorkflowListPage({
  workflows,
  isLoading,
  errorMessage,
  canManageWorkflows,
}: WorkflowListPageProps) {
  return (
    <PageScaffold className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage orchestration flows for domain events and
            schedules.
          </p>
          {!canManageWorkflows ? (
            <p className="text-xs text-muted-foreground">
              Read-only access for your role.
            </p>
          ) : null}
        </div>
        {canManageWorkflows ? (
          <Button asChild>
            <Link
              to="/workflows/$workflowId"
              params={{ workflowId: "current" }}
            >
              <Icon icon={Add01Icon} className="size-4" />
              New workflow
            </Link>
          </Button>
        ) : null}
      </header>

      {isLoading ? <EntityListLoadingState rows={4} cols={3} /> : null}

      {!isLoading && errorMessage ? (
        <EntityListEmptyState>
          <p className="text-sm text-destructive">{errorMessage}</p>
        </EntityListEmptyState>
      ) : null}

      {!isLoading && !errorMessage && workflows.length === 0 ? (
        <EntityListEmptyState>
          {canManageWorkflows
            ? "No workflows yet. Create your first workflow to get started."
            : "No workflows have been created for this organization yet."}
        </EntityListEmptyState>
      ) : null}

      {!isLoading && !errorMessage && workflows.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workflows.map((workflow) => (
            <Card key={workflow.id}>
              <CardHeader>
                <CardTitle className="line-clamp-1">{workflow.name}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {workflow.description || "No description"}
                </CardDescription>
                <CardAction>
                  <Badge
                    variant={toVisibilityBadgeVariant(workflow.visibility)}
                  >
                    {workflow.visibility}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Updated:</span>{" "}
                  {formatDisplayDateTime(workflow.updatedAt)}
                </p>
              </CardContent>
              <CardFooter className="justify-end">
                <Button asChild size="sm" variant="outline">
                  <Link
                    to="/workflows/$workflowId"
                    params={{ workflowId: workflow.id }}
                  >
                    Open editor
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : null}
    </PageScaffold>
  );
}
