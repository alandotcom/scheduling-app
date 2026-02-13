import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Add01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import type { WorkflowDefinitionStatus } from "@scheduling/dto";
import { PageScaffold } from "@/components/layout/page-scaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { formatDisplayDateTime } from "@/lib/date-utils";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/query";

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

function WorkflowsIndexPage() {
  const queryClient = useQueryClient();
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();
  const canQueryWorkflowData =
    !isSessionPending && !!session?.session.activeOrganizationId;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [cancellingRunId, setCancellingRunId] = useState<string | null>(null);

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
        <Button className="hidden shrink-0 sm:inline-flex" asChild>
          <Link to="/workflows/$workflowId" params={{ workflowId: "new" }}>
            <Icon icon={Add01Icon} data-icon="inline-start" />
            New Workflow
          </Link>
        </Button>
      </div>

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

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
        <Button className="w-full" asChild>
          <Link to="/workflows/$workflowId" params={{ workflowId: "new" }}>
            <Icon icon={Add01Icon} data-icon="inline-start" />
            New Workflow
          </Link>
        </Button>
      </div>
    </PageScaffold>
  );
}

export const Route = createFileRoute("/_authenticated/workflows/")({
  component: WorkflowsIndexPage,
});
