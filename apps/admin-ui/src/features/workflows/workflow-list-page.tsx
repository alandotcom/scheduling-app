import { useState } from "react";
import { Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  JourneyListResponse,
  SerializedJourneyGraph,
} from "@scheduling/dto";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
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
import { orpc } from "@/lib/query";

type OrgRole = "owner" | "admin" | "member" | null | undefined;

export function canManageWorkflowsForRole(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

function createDefaultJourneyGraph(): SerializedJourneyGraph {
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
  journeys: JourneyListResponse;
  isLoading: boolean;
  errorMessage?: string | null;
  canManageWorkflows: boolean;
}

function toStateBadgeVariant(
  state: "draft" | "published" | "paused" | "test_only",
): "outline" | "default" | "secondary" {
  switch (state) {
    case "published":
      return "default";
    case "test_only":
      return "secondary";
    default:
      return "outline";
  }
}

function toStateLabel(
  state: "draft" | "published" | "paused" | "test_only",
): string {
  if (state === "test_only") {
    return "Test-only";
  }

  if (state === "published") {
    return "Published";
  }

  if (state === "paused") {
    return "Paused";
  }

  return "Draft";
}

export function WorkflowListPage({
  journeys,
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
  const [lifecycleTargetId, setLifecycleTargetId] = useState<string | null>(
    null,
  );

  const createMutation = useMutation(
    orpc.journeys.create.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: orpc.journeys.key() });
        navigate({
          to: "/workflows/$workflowId",
          params: { workflowId: data.id },
        });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create journey");
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.journeys.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.journeys.key() });
        setDeleteTarget(null);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete journey");
      },
    }),
  );

  const publishMutation = useMutation(
    orpc.journeys.publish.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.journeys.key() });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to publish journey");
      },
      onSettled: () => {
        setLifecycleTargetId(null);
      },
    }),
  );

  const pauseMutation = useMutation(
    orpc.journeys.pause.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.journeys.key() });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to pause journey");
      },
      onSettled: () => {
        setLifecycleTargetId(null);
      },
    }),
  );

  const resumeMutation = useMutation(
    orpc.journeys.resume.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.journeys.key() });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to resume journey");
      },
      onSettled: () => {
        setLifecycleTargetId(null);
      },
    }),
  );

  const isLifecyclePending =
    publishMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending;

  return (
    <PageScaffold className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Journeys</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage linear appointment journeys.
          </p>
          {!canManageWorkflows ? (
            <p className="text-xs text-muted-foreground">
              Read-only access for your role.
            </p>
          ) : null}
        </div>
        {canManageWorkflows ? (
          <Button
            disabled={createMutation.isPending}
            onClick={() =>
              createMutation.mutate({
                graph: createDefaultJourneyGraph(),
              })
            }
          >
            <Icon className="size-4" icon={Add01Icon} />
            {createMutation.isPending ? "Creating..." : "New journey"}
          </Button>
        ) : null}
      </header>

      {isLoading ? <EntityListLoadingState cols={3} rows={4} /> : null}

      {!isLoading && errorMessage ? (
        <EntityListEmptyState>
          <p className="text-sm text-destructive">{errorMessage}</p>
        </EntityListEmptyState>
      ) : null}

      {!isLoading && !errorMessage && journeys.length === 0 ? (
        <EntityListEmptyState>
          {canManageWorkflows
            ? "No journeys yet. Create your first journey to get started."
            : "No journeys have been created for this organization yet."}
        </EntityListEmptyState>
      ) : null}

      {!isLoading && !errorMessage && journeys.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {journeys.map((journey) => (
            <Card key={journey.id}>
              <CardHeader>
                <CardTitle className="line-clamp-1">{journey.name}</CardTitle>
                <CardDescription className="line-clamp-2">
                  Linear appointment journey
                </CardDescription>
                <CardAction>
                  <Badge variant={toStateBadgeVariant(journey.state)}>
                    {toStateLabel(journey.state)}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  <span className="font-medium text-foreground">Updated:</span>{" "}
                  {formatDisplayDateTime(journey.updatedAt)}
                </p>
              </CardContent>
              <CardFooter className="justify-end gap-2">
                {canManageWorkflows ? (
                  journey.state === "draft" ? (
                    <>
                      <Button
                        disabled={isLifecyclePending}
                        onClick={() => {
                          setLifecycleTargetId(journey.id);
                          publishMutation.mutate({
                            id: journey.id,
                            data: { mode: "live" },
                          });
                        }}
                        size="sm"
                        variant="outline"
                      >
                        {publishMutation.isPending &&
                        lifecycleTargetId === journey.id
                          ? "Publishing..."
                          : "Publish"}
                      </Button>
                      <Button
                        disabled={isLifecyclePending}
                        onClick={() => {
                          setLifecycleTargetId(journey.id);
                          publishMutation.mutate({
                            id: journey.id,
                            data: { mode: "test" },
                          });
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Test-only
                      </Button>
                    </>
                  ) : journey.state === "paused" ? (
                    <Button
                      disabled={isLifecyclePending}
                      onClick={() => {
                        setLifecycleTargetId(journey.id);
                        resumeMutation.mutate({
                          id: journey.id,
                          data: { targetState: "published" },
                        });
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {resumeMutation.isPending &&
                      lifecycleTargetId === journey.id
                        ? "Resuming..."
                        : "Resume"}
                    </Button>
                  ) : (
                    <Button
                      disabled={isLifecyclePending}
                      onClick={() => {
                        setLifecycleTargetId(journey.id);
                        pauseMutation.mutate({ id: journey.id });
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {pauseMutation.isPending &&
                      lifecycleTargetId === journey.id
                        ? "Pausing..."
                        : "Pause"}
                    </Button>
                  )
                ) : null}

                {canManageWorkflows ? (
                  <Button
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() =>
                      setDeleteTarget({
                        id: journey.id,
                        name: journey.name,
                      })
                    }
                    size="sm"
                    variant="ghost"
                  >
                    <Icon className="size-4" icon={Delete01Icon} />
                    Delete
                  </Button>
                ) : null}
                <Button asChild size="sm" variant="outline">
                  <Link
                    params={{ workflowId: journey.id }}
                    to="/workflows/$workflowId"
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
        description="This will permanently delete this journey. This action cannot be undone."
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate({ id: deleteTarget.id });
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name ?? "journey"}"?`}
      />
    </PageScaffold>
  );
}
