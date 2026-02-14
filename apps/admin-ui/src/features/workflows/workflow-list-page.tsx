import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Add01Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import type { WorkflowDefinitionStatus } from "@scheduling/dto";
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
import {
  createDefaultReferenceWorkflowGraph,
  referenceGraphToCanonicalGraph,
} from "@/lib/workflows/reference-adapter";
import { orpc } from "@/lib/query";

function formatDateTime(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value instanceof Date ? value.toISOString() : value;
  }
  return parsed.toLocaleString();
}

function toStatusBadgeVariant(
  status: WorkflowDefinitionStatus,
): "default" | "secondary" | "warning" {
  if (status === "active") return "default";
  if (status === "draft") return "warning";
  return "secondary";
}

function buildWorkflowName(index: number): string {
  return `Workflow ${index + 1}`;
}

function buildWorkflowKey(index: number): string {
  const suffix = `${Date.now().toString(36)}${Math.floor(
    Math.random() * 10000,
  ).toString(36)}`;
  return `workflow-${index + 1}-${suffix}`;
}

export function WorkflowListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const listQuery = useQuery(
    orpc.workflows.listDefinitions.queryOptions({
      input: {},
    }),
  );

  const workflows = useMemo(
    () => listQuery.data?.items ?? [],
    [listQuery.data?.items],
  );

  const createMutation = useMutation(
    orpc.workflows.createDefinition.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
        await navigate({
          to: "/workflows/$workflowId",
          params: { workflowId: created.id },
        });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create workflow");
      },
    }),
  );

  const handleCreateWorkflow = () => {
    const workflowGraph = referenceGraphToCanonicalGraph(
      createDefaultReferenceWorkflowGraph(),
    );
    const nextIndex = workflows.length;
    createMutation.mutate({
      key: buildWorkflowKey(nextIndex),
      name: buildWorkflowName(nextIndex),
      workflowGraph,
    });
  };

  return (
    <PageScaffold className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage orchestration flows for domain events and
            schedules.
          </p>
        </div>
        <Button
          onClick={handleCreateWorkflow}
          disabled={createMutation.isPending}
        >
          <Icon icon={Add01Icon} className="size-4" />
          {createMutation.isPending ? "Creating..." : "New workflow"}
        </Button>
      </header>

      {listQuery.isLoading ? (
        <EntityListLoadingState rows={5} cols={4} />
      ) : listQuery.error ? (
        <EntityListEmptyState>
          Failed to load workflows. Refresh the page and try again.
        </EntityListEmptyState>
      ) : workflows.length === 0 ? (
        <EntityListEmptyState>
          <div className="space-y-3">
            <p>No workflows yet.</p>
            <Button
              variant="outline"
              onClick={handleCreateWorkflow}
              disabled={createMutation.isPending}
            >
              <Icon icon={Add01Icon} className="size-4" />
              Create your first workflow
            </Button>
          </div>
        </EntityListEmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workflows.map((workflow) => (
            <Card key={workflow.id}>
              <CardHeader>
                <CardTitle className="line-clamp-1">{workflow.name}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {workflow.description || "No description"}
                </CardDescription>
                <CardAction>
                  <Badge variant={toStatusBadgeVariant(workflow.status)}>
                    {workflow.status}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Key:</span>{" "}
                  {workflow.key}
                </p>
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Updated:</span>{" "}
                  {formatDateTime(workflow.updatedAt)}
                </p>
              </CardContent>
              <CardFooter className="justify-end">
                <Button
                  variant="outline"
                  onClick={() =>
                    navigate({
                      to: "/workflows/$workflowId",
                      params: { workflowId: workflow.id },
                    })
                  }
                >
                  Open
                  <Icon icon={ArrowRight02Icon} className="size-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </PageScaffold>
  );
}
