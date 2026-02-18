import { useMemo, useState } from "react";
import {
  Add01Icon,
  Delete01Icon,
  PauseIcon,
  PlayIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDisplayDateTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { orpc } from "@/lib/query";

type OrgRole = "owner" | "admin" | "member" | null | undefined;
type JourneyStatus = "draft" | "published" | "paused";
type JourneyMode = "live" | "test";
type JourneyLifecycleStatus = "draft" | "published";

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
              triggerType: "AppointmentJourney",
              start: "appointment.scheduled",
              restart: "appointment.rescheduled",
              stop: "appointment.canceled",
              correlationKey: "appointmentId",
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
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

export function toLifecycleStatus(
  status: JourneyStatus,
): JourneyLifecycleStatus {
  return status === "draft" ? "draft" : "published";
}

function toStatusBadgeVariant(
  status: JourneyLifecycleStatus,
): "outline" | "default" {
  return status === "published" ? "default" : "outline";
}

function toStatusLabel(status: JourneyLifecycleStatus): string {
  return status === "published" ? "Published" : "Draft";
}

interface WorkflowLifecycleControlsProps {
  canManageWorkflows: boolean;
  status: JourneyStatus;
  mode: JourneyMode;
  isPending: boolean;
  compact?: boolean;
  onModeChange: (mode: JourneyMode) => void;
  onPublish: (mode: JourneyMode) => void;
  onPause: () => void;
  onResume: () => void;
}

function WorkflowLifecycleControls({
  canManageWorkflows,
  status,
  mode,
  isPending,
  compact = false,
  onModeChange,
  onPublish,
  onPause,
  onResume,
}: WorkflowLifecycleControlsProps) {
  if (!canManageWorkflows) {
    return null;
  }

  const modeDisabled = isPending || status !== "published";

  const primaryLabel =
    status === "draft" ? "Publish" : status === "paused" ? "Resume" : "Pause";

  const primaryAction =
    status === "draft"
      ? () => onPublish(mode)
      : status === "paused"
        ? onResume
        : onPause;

  return (
    <div
      className={
        compact
          ? "flex shrink-0 items-center gap-1.5"
          : "flex shrink-0 items-center justify-end gap-2"
      }
    >
      <div className="inline-flex items-center rounded-md border border-border bg-muted/20 p-0.5">
        <Button
          className={cn(
            compact ? "h-8 rounded-md px-2.5" : "h-8 rounded-md px-2",
            "border-transparent shadow-none hover:translate-y-0 hover:shadow-none",
            mode === "live" &&
              "bg-foreground text-background hover:bg-foreground/90",
          )}
          disabled={modeDisabled}
          onClick={() => onModeChange("live")}
          size="sm"
          type="button"
          variant="ghost"
        >
          Live
        </Button>
        <Button
          className={cn(
            compact ? "h-8 rounded-md px-2.5" : "h-8 rounded-md px-2",
            "border-transparent shadow-none hover:translate-y-0 hover:shadow-none",
            mode === "test" &&
              "bg-destructive/10 text-destructive hover:bg-destructive/20",
          )}
          disabled={modeDisabled}
          onClick={() => onModeChange("test")}
          size="sm"
          type="button"
          variant="ghost"
        >
          Test
        </Button>
      </div>
      {status === "draft" ? (
        <Button
          className={
            compact
              ? "h-8 w-24 shrink-0 justify-center px-2.5"
              : "w-24 shrink-0 justify-center"
          }
          disabled={isPending}
          onClick={primaryAction}
          size="sm"
          variant="outline"
        >
          {primaryLabel}
        </Button>
      ) : (
        <Button
          aria-label={
            status === "paused" ? "Resume workflow" : "Pause workflow"
          }
          className={
            status === "paused"
              ? "h-8 w-8 shrink-0 border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "h-8 w-8 shrink-0 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
          }
          disabled={isPending}
          onClick={primaryAction}
          size="icon-sm"
          title={status === "paused" ? "Resume" : "Pause"}
          variant="outline"
        >
          <Icon icon={status === "paused" ? PlayIcon : PauseIcon} />
        </Button>
      )}
    </div>
  );
}

export function WorkflowListPage({
  journeys,
  isLoading,
  errorMessage,
  canManageWorkflows,
  searchQuery,
  onSearchQueryChange,
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
  const [draftModeByJourneyId, setDraftModeByJourneyId] = useState<
    Record<string, JourneyMode>
  >({});

  const patchJourney = (
    journeyId: string,
    next: { status: JourneyStatus; mode: JourneyMode },
  ) => {
    queryClient.setQueryData<JourneyListResponse | undefined>(
      orpc.journeys.list.key(),
      (current) => {
        if (!current) {
          return current;
        }

        return current.map((journey) => {
          if (journey.id !== journeyId) {
            return journey;
          }

          return {
            ...journey,
            status: next.status,
            mode: next.mode,
          };
        });
      },
    );
  };

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
      onSuccess: ({ journey }) => {
        patchJourney(journey.id, {
          status: journey.status,
          mode: journey.mode,
        });
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
      onSuccess: (journey) => {
        patchJourney(journey.id, {
          status: journey.status,
          mode: journey.mode,
        });
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
      onSuccess: (journey) => {
        patchJourney(journey.id, {
          status: journey.status,
          mode: journey.mode,
        });
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

  const setModeMutation = useMutation(
    orpc.journeys.setMode.mutationOptions({
      onSuccess: (journey) => {
        patchJourney(journey.id, {
          status: journey.status,
          mode: journey.mode,
        });
        queryClient.invalidateQueries({ queryKey: orpc.journeys.key() });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update journey mode");
      },
      onSettled: () => {
        setLifecycleTargetId(null);
      },
    }),
  );

  const isLifecyclePending =
    publishMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    setModeMutation.isPending;

  const filteredJourneys = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length === 0) {
      return journeys;
    }

    return journeys.filter((journey) =>
      journey.name.toLowerCase().includes(query),
    );
  }, [journeys, searchQuery]);

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Icon
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            icon={Search01Icon}
          />
          <Input
            className="pl-9"
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search journeys by name"
            value={searchQuery}
          />
        </div>
      </div>

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

      {!isLoading &&
      !errorMessage &&
      journeys.length > 0 &&
      filteredJourneys.length === 0 ? (
        <EntityListEmptyState>
          No journeys found matching your search.
        </EntityListEmptyState>
      ) : null}

      {!isLoading && !errorMessage && filteredJourneys.length > 0 ? (
        <div className="grid gap-4 min-[641px]:hidden">
          {filteredJourneys.map((journey) => {
            const status: JourneyStatus = journey.status || "draft";
            const lifecycleStatus = toLifecycleStatus(status);
            const persistedMode: JourneyMode = journey.mode || "live";
            const mode =
              status === "draft"
                ? (draftModeByJourneyId[journey.id] ?? persistedMode)
                : persistedMode;
            const isPending =
              isLifecyclePending && lifecycleTargetId === journey.id;

            return (
              <Card key={journey.id}>
                <CardHeader>
                  <CardTitle className="line-clamp-1">{journey.name}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    Linear appointment journey
                  </CardDescription>
                  <CardAction className="flex items-center gap-2">
                    <Badge variant={toStatusBadgeVariant(lifecycleStatus)}>
                      {toStatusLabel(lifecycleStatus)}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Updated:
                    </span>{" "}
                    {formatDisplayDateTime(journey.updatedAt)}
                  </p>
                </CardContent>
                <CardFooter className="flex items-center justify-end gap-2 overflow-x-auto">
                  <WorkflowLifecycleControls
                    canManageWorkflows={canManageWorkflows}
                    compact
                    isPending={isPending}
                    mode={mode}
                    onModeChange={(nextMode) => {
                      if (status === "draft") {
                        setDraftModeByJourneyId((current) => ({
                          ...current,
                          [journey.id]: nextMode,
                        }));
                        return;
                      }

                      if (
                        status !== "published" ||
                        persistedMode === nextMode
                      ) {
                        return;
                      }

                      setLifecycleTargetId(journey.id);
                      setModeMutation.mutate({
                        id: journey.id,
                        data: { mode: nextMode },
                      });
                    }}
                    onPause={() => {
                      setLifecycleTargetId(journey.id);
                      pauseMutation.mutate({ id: journey.id });
                    }}
                    onPublish={(publishMode) => {
                      setLifecycleTargetId(journey.id);
                      publishMutation.mutate({
                        id: journey.id,
                        data: { mode: publishMode },
                      });
                    }}
                    onResume={() => {
                      setLifecycleTargetId(journey.id);
                      resumeMutation.mutate({ id: journey.id });
                    }}
                    status={status}
                  />
                  <Button
                    asChild
                    className="shrink-0"
                    size="sm"
                    variant="outline"
                  >
                    <Link
                      params={{ workflowId: journey.id }}
                      to="/workflows/$workflowId"
                    >
                      Open editor
                    </Link>
                  </Button>
                  {canManageWorkflows ? (
                    <Button
                      className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredJourneys.length > 0 ? (
        <div className="hidden rounded-md border min-[641px]:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-[30rem] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJourneys.map((journey) => {
                const status: JourneyStatus = journey.status || "draft";
                const lifecycleStatus = toLifecycleStatus(status);
                const persistedMode: JourneyMode = journey.mode || "live";
                const mode =
                  status === "draft"
                    ? (draftModeByJourneyId[journey.id] ?? persistedMode)
                    : persistedMode;
                const isPending =
                  isLifecyclePending && lifecycleTargetId === journey.id;

                return (
                  <TableRow key={journey.id}>
                    <TableCell className="font-medium">
                      {journey.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant={toStatusBadgeVariant(lifecycleStatus)}>
                        {toStatusLabel(lifecycleStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDisplayDateTime(journey.updatedAt)}
                    </TableCell>
                    <TableCell className="w-[30rem]">
                      <div className="flex items-center justify-end gap-2">
                        <WorkflowLifecycleControls
                          canManageWorkflows={canManageWorkflows}
                          isPending={isPending}
                          mode={mode}
                          onModeChange={(nextMode) => {
                            if (status === "draft") {
                              setDraftModeByJourneyId((current) => ({
                                ...current,
                                [journey.id]: nextMode,
                              }));
                              return;
                            }

                            if (
                              status !== "published" ||
                              persistedMode === nextMode
                            ) {
                              return;
                            }

                            setLifecycleTargetId(journey.id);
                            setModeMutation.mutate({
                              id: journey.id,
                              data: { mode: nextMode },
                            });
                          }}
                          onPause={() => {
                            setLifecycleTargetId(journey.id);
                            pauseMutation.mutate({ id: journey.id });
                          }}
                          onPublish={(publishMode) => {
                            setLifecycleTargetId(journey.id);
                            publishMutation.mutate({
                              id: journey.id,
                              data: { mode: publishMode },
                            });
                          }}
                          onResume={() => {
                            setLifecycleTargetId(journey.id);
                            resumeMutation.mutate({ id: journey.id });
                          }}
                          status={status}
                        />
                        {canManageWorkflows ? (
                          <Button
                            className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                        >
                          <Link
                            params={{ workflowId: journey.id }}
                            to="/workflows/$workflowId"
                          >
                            Open editor
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
