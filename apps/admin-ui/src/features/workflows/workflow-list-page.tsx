import { useState } from "react";
import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  SerializedWorkflowGraph,
  WorkflowListResponse,
} from "@scheduling/dto";
import {
  EntityListEmptyState,
  EntityListLoadingState,
} from "@/components/entity-list";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
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
import { orpc } from "@/lib/query";

type OrgRole = "owner" | "admin" | "member" | null | undefined;

export function canManageWorkflowsForRole(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

function createDefaultWorkflowGraph(): SerializedWorkflowGraph {
  const triggerId = crypto.randomUUID();

  return {
    attributes: {},
    options: { type: "directed" },
    nodes: [
      {
        key: triggerId,
        attributes: {
          id: triggerId,
          type: "trigger",
          position: { x: 0, y: 0 },
          data: {
            label: "",
            description: "",
            type: "trigger",
            status: "idle",
            config: {
              triggerType: "DomainEvent",
              domain: "appointment",
              startEvents: [],
              restartEvents: [],
              stopEvents: [],
            },
          },
        },
      },
    ],
    edges: [],
  };
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

function toRuntimeBadgeVariant(isEnabled: boolean): "success" | "outline" {
  return isEnabled ? "success" : "outline";
}

export function WorkflowListPage({
  workflows,
  isLoading,
  errorMessage,
  canManageWorkflows,
}: WorkflowListPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [toggleTargetWorkflowId, setToggleTargetWorkflowId] = useState<
    string | null
  >(null);

  const createMutation = useMutation(
    orpc.workflows.create.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
        navigate({
          to: "/workflows/$workflowId",
          params: { workflowId: data.id },
        });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create workflow");
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.workflows.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
        setDeleteTarget(null);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete workflow");
      },
    }),
  );
  const toggleEnabledMutation = useMutation(
    orpc.workflows.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update workflow state");
      },
      onSettled: () => {
        setToggleTargetWorkflowId(null);
      },
    }),
  );

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
          <Button
            onClick={() =>
              createMutation.mutate({
                graph: createDefaultWorkflowGraph(),
              })
            }
            disabled={createMutation.isPending}
          >
            <Icon icon={Add01Icon} className="size-4" />
            {createMutation.isPending ? "Creating..." : "New workflow"}
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
                  <div className="flex items-center gap-2">
                    <Badge variant={toRuntimeBadgeVariant(workflow.isEnabled)}>
                      {workflow.isEnabled ? "On" : "Off"}
                    </Badge>
                    <Badge
                      variant={toVisibilityBadgeVariant(workflow.visibility)}
                    >
                      {workflow.visibility}
                    </Badge>
                  </div>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Updated:</span>{" "}
                  {formatDisplayDateTime(workflow.updatedAt)}
                </p>
              </CardContent>
              <CardFooter className="justify-end gap-2">
                {canManageWorkflows ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={toggleEnabledMutation.isPending}
                    onClick={() => {
                      setToggleTargetWorkflowId(workflow.id);
                      toggleEnabledMutation.mutate({
                        id: workflow.id,
                        data: { isEnabled: !workflow.isEnabled },
                      });
                    }}
                  >
                    {toggleEnabledMutation.isPending &&
                    toggleTargetWorkflowId === workflow.id
                      ? "Updating..."
                      : workflow.isEnabled
                        ? "Turn off"
                        : "Turn on"}
                  </Button>
                ) : null}
                {canManageWorkflows ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() =>
                      setDeleteTarget({
                        id: workflow.id,
                        name: workflow.name,
                      })
                    }
                  >
                    <Icon icon={Delete01Icon} className="size-4" />
                    Delete
                  </Button>
                ) : null}
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

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id });
        }}
        title={`Delete "${deleteTarget?.name ?? "workflow"}"?`}
        description="This will permanently delete this workflow. This action cannot be undone."
        isPending={deleteMutation.isPending}
      />
    </PageScaffold>
  );
}
