import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Add01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import {
  getCatalogTriggerEventTypes,
  resolveDefaultCatalogTriggerEventType,
} from "@scheduling/workflow-ui";

import type {
  WebhookEventType,
  WorkflowDefinitionStatus,
} from "@scheduling/dto";
import { webhookEventTypes } from "@scheduling/dto";
import { EntityModal } from "@/components/entity-modal";
import { PageScaffold } from "@/components/layout/page-scaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ShortcutBadge } from "@/components/ui/shortcut-badge";
import { formatDisplayDateTime } from "@/lib/date-utils";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/query";

function createDefaultWorkflowDraft(triggerEventType: WebhookEventType) {
  return {
    trigger: {
      event: triggerEventType,
      eventType: triggerEventType,
    },
    nodes: [],
    edges: [],
  };
}

type StatusFilter = WorkflowDefinitionStatus | "all";

function definitionStatusBadgeVariant(status: WorkflowDefinitionStatus) {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  return "outline";
}

function runStatusBadgeVariant(
  status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "unknown",
) {
  if (status === "completed") return "success";
  if (status === "pending" || status === "running") return "warning";
  if (status === "failed") return "destructive";
  return "outline";
}

function isWebhookEventType(value: string): value is WebhookEventType {
  return webhookEventTypes.some((eventType) => eventType === value);
}

function WorkflowsIndexPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();
  const canQueryWorkflowData =
    !isSessionPending && !!session?.session.activeOrganizationId;
  const { create } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTriggerEventType, setNewTriggerEventType] =
    useState<WebhookEventType>(webhookEventTypes[0]);
  const [cancellingRunId, setCancellingRunId] = useState<string | null>(null);

  useEffect(() => {
    if (create !== "1") return;
    setShowCreateModal(true);
    navigate({
      search: (prev) => ({
        ...prev,
        create: undefined,
      }),
      replace: true,
    });
  }, [create, navigate]);

  const definitionsQuery = useQuery({
    ...orpc.workflows.listDefinitions.queryOptions({
      input: {},
    }),
    enabled: canQueryWorkflowData,
    placeholderData: (previous) => previous,
  });
  const runsQuery = useQuery({
    ...orpc.workflows.listRuns.queryOptions({
      input: { limit: 25 },
    }),
    enabled: canQueryWorkflowData,
    placeholderData: (previous) => previous,
  });
  const catalogQuery = useQuery({
    ...orpc.workflows.catalog.queryOptions(),
    enabled: canQueryWorkflowData,
    placeholderData: (previous) => previous,
  });

  const availableTriggerEventTypes = useMemo(
    () =>
      getCatalogTriggerEventTypes(
        catalogQuery.data?.triggers ?? [],
        webhookEventTypes,
      ).filter(isWebhookEventType),
    [catalogQuery.data?.triggers],
  );

  useEffect(() => {
    if (availableTriggerEventTypes.length === 0) {
      return;
    }

    if (availableTriggerEventTypes.includes(newTriggerEventType)) {
      return;
    }

    setNewTriggerEventType(
      resolveDefaultCatalogTriggerEventType(
        catalogQuery.data?.triggers ?? [],
        availableTriggerEventTypes[0] ?? webhookEventTypes[0],
      ),
    );
  }, [
    availableTriggerEventTypes,
    catalogQuery.data?.triggers,
    newTriggerEventType,
  ]);

  const createDefinitionMutation = useMutation(
    orpc.workflows.createDefinition.mutationOptions({
      onSuccess: async (definition) => {
        await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
        toast.success("Workflow created");
        setShowCreateModal(false);
        setNewKey("");
        setNewName("");
        setNewDescription("");
        setNewTriggerEventType(webhookEventTypes[0]);
        await navigate({
          to: "/workflows/$workflowId",
          params: { workflowId: definition.id },
        });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create workflow");
      },
    }),
  );

  const cancelRunMutation = useMutation(
    orpc.workflows.cancelRun.mutationOptions({
      onMutate: (input) => {
        setCancellingRunId(input.runId);
      },
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
        toast.success("Run cancellation requested");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to cancel run");
      },
      onSettled: () => {
        setCancellingRunId(null);
      },
    }),
  );

  const definitions = definitionsQuery.data?.items ?? [];
  const filteredDefinitions = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return definitions.filter((definition) => {
      if (statusFilter !== "all" && definition.status !== statusFilter) {
        return false;
      }
      if (!normalized) return true;
      return (
        definition.key.toLowerCase().includes(normalized) ||
        definition.name.toLowerCase().includes(normalized)
      );
    });
  }, [definitions, search, statusFilter]);

  const runs = runsQuery.data?.items ?? [];
  const statusFilterLabel =
    statusFilter === "all"
      ? "All statuses"
      : statusFilter === "active"
        ? "Active"
        : statusFilter === "draft"
          ? "Draft"
          : "Archived";

  const handleCreateWorkflow = useCallback(() => {
    const key = newKey.trim();
    const name = newName.trim();
    const description = newDescription.trim();
    if (!key || !name) {
      toast.error("Key and name are required");
      return;
    }

    createDefinitionMutation.mutate({
      key,
      name,
      description: description || undefined,
      workflowGraph: {
        ...createDefaultWorkflowDraft(newTriggerEventType),
      },
    });
  }, [
    createDefinitionMutation,
    newDescription,
    newKey,
    newName,
    newTriggerEventType,
  ]);

  if (!canQueryWorkflowData) {
    return (
      <PageScaffold>
        <div className="text-sm text-muted-foreground">
          Loading organization context...
        </div>
      </PageScaffold>
    );
  }

  return (
    <PageScaffold>
      <div className="flex items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by key or name"
          />
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter(
                value === "all" ||
                  value === "draft" ||
                  value === "active" ||
                  value === "archived"
                  ? value
                  : "all",
              )
            }
          >
            <SelectTrigger>{statusFilterLabel}</SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          className="hidden shrink-0 sm:inline-flex"
          onClick={() => setShowCreateModal(true)}
        >
          <Icon icon={Add01Icon} data-icon="inline-start" />
          New Workflow
          <ShortcutBadge shortcut="c" className="ml-2 hidden md:inline-flex" />
        </Button>
      </div>

      {/* Definitions — clickable card list */}
      <div className="mt-4 space-y-2">
        {definitionsQuery.isLoading ? (
          <div className="py-6 text-sm text-muted-foreground">
            Loading workflows...
          </div>
        ) : definitionsQuery.error ? (
          <div className="py-6 text-sm text-destructive">
            Failed to load workflows
          </div>
        ) : filteredDefinitions.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">
            No workflows match the current filters.
          </div>
        ) : (
          filteredDefinitions.map((definition) => (
            <Link
              key={definition.id}
              to="/workflows/$workflowId"
              params={{ workflowId: definition.id }}
              preload="intent"
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{definition.name}</p>
                  <Badge
                    variant={definitionStatusBadgeVariant(definition.status)}
                    className="shrink-0"
                  >
                    {definition.status}
                  </Badge>
                </div>
                {definition.description ? (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {definition.description}
                  </p>
                ) : null}
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <code>{definition.key}</code>
                  <span>Rev {definition.draftRevision}</span>
                  <span>{formatDisplayDateTime(definition.updatedAt)}</span>
                </div>
              </div>
              <Icon
                icon={ArrowRight01Icon}
                className="ml-3 size-4 shrink-0 text-muted-foreground"
              />
            </Link>
          ))
        )}
      </div>

      {/* Recent Runs — compact list */}
      <div className="mt-8">
        <h3 className="text-sm font-medium text-muted-foreground">
          Recent Runs
        </h3>
        <div className="mt-2 space-y-1">
          {runsQuery.isLoading ? (
            <div className="py-4 text-sm text-muted-foreground">
              Loading runs...
            </div>
          ) : runsQuery.error ? (
            <div className="py-4 text-sm text-destructive">
              Failed to load runs
            </div>
          ) : runs.length === 0 ? (
            <div className="py-4 text-sm text-muted-foreground">
              No workflow runs yet.
            </div>
          ) : (
            runs.map((run) => {
              const canCancel =
                run.status === "pending" || run.status === "running";
              const isCancelling = cancellingRunId === run.runId;
              return (
                <div
                  key={run.runId}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={runStatusBadgeVariant(run.status)}
                      className="text-xs"
                    >
                      {run.status}
                    </Badge>
                    <span className="text-muted-foreground">
                      {run.workflowType}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDisplayDateTime(run.startedAt)}
                    </span>
                  </div>
                  {canCancel ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isCancelling || cancelRunMutation.isPending}
                      onClick={() =>
                        cancelRunMutation.mutate({ runId: run.runId })
                      }
                    >
                      {isCancelling ? "Cancelling..." : "Cancel"}
                    </Button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      <EntityModal
        open={showCreateModal}
        onOpenChange={(open) => {
          setShowCreateModal(open);
        }}
        className="md:max-w-[min(96vw,80rem)] md:h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-2rem)] md:top-4"
        title="Create Workflow"
        description="Create a workflow definition and start a draft."
      >
        <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
          <div className="space-y-2">
            <Label htmlFor="workflow-key">Key</Label>
            <Input
              id="workflow-key"
              value={newKey}
              onChange={(event) => setNewKey(event.target.value)}
              placeholder="appointment_reminder"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workflow-name">Name</Label>
            <Input
              id="workflow-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Appointment reminder"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workflow-description">Description</Label>
            <Input
              id="workflow-description"
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workflow-trigger-event">Trigger Event</Label>
            <Select
              value={newTriggerEventType}
              onValueChange={(value) => {
                if (!value || !isWebhookEventType(value)) return;
                setNewTriggerEventType(value);
              }}
            >
              <SelectTrigger id="workflow-trigger-event">
                {newTriggerEventType}
              </SelectTrigger>
              <SelectContent>
                {availableTriggerEventTypes.map((eventType) => (
                  <SelectItem key={eventType} value={eventType}>
                    {eventType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Graph actions are edited in the workflow detail editor after
              creation.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateModal(false)}
              disabled={createDefinitionMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateWorkflow}
              disabled={createDefinitionMutation.isPending}
            >
              {createDefinitionMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </EntityModal>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
        <Button className="w-full" onClick={() => setShowCreateModal(true)}>
          <Icon icon={Add01Icon} data-icon="inline-start" />
          New Workflow
        </Button>
      </div>
    </PageScaffold>
  );
}

export const Route = createFileRoute("/_authenticated/workflows/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    create?: "1";
  } => {
    const create = search.create === "1" ? "1" : undefined;
    return { create };
  },
  component: WorkflowsIndexPage,
});
