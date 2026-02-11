import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import type { WorkflowDefinitionStatus } from "@scheduling/dto";
import { workflowKitDocumentSchema } from "@scheduling/dto";
import { EntityModal } from "@/components/entity-modal";
import { PageHeader, PageScaffold } from "@/components/layout/page-scaffold";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDisplayDateTime } from "@/lib/date-utils";
import { getQueryClient, orpc } from "@/lib/query";
import { swallowIgnorableRouteLoaderError } from "@/lib/query-cancellation";

const DEFAULT_WORKFLOW_KIT_JSON = `{
  "trigger": {
    "event": "appointment.created"
  }
}`;

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

function parseWorkflowKitText(text: string) {
  try {
    const parsed = JSON.parse(text);
    const result = workflowKitDocumentSchema.safeParse(parsed);
    if (!result.success) {
      return {
        ok: false as const,
        message: "WorkflowKit JSON must be a valid object.",
      };
    }
    return { ok: true as const, value: result.data };
  } catch {
    return {
      ok: false as const,
      message: "WorkflowKit JSON is invalid.",
    };
  }
}

function WorkflowsIndexPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { create } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newWorkflowKitText, setNewWorkflowKitText] = useState(
    DEFAULT_WORKFLOW_KIT_JSON,
  );
  const [draftParseError, setDraftParseError] = useState<string | null>(null);
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
    placeholderData: (previous) => previous,
  });
  const runsQuery = useQuery({
    ...orpc.workflows.listRuns.queryOptions({
      input: { limit: 25 },
    }),
    placeholderData: (previous) => previous,
  });

  const createDefinitionMutation = useMutation(
    orpc.workflows.createDefinition.mutationOptions({
      onSuccess: async (definition) => {
        await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
        toast.success("Workflow created");
        setShowCreateModal(false);
        setDraftParseError(null);
        setNewKey("");
        setNewName("");
        setNewDescription("");
        setNewWorkflowKitText(DEFAULT_WORKFLOW_KIT_JSON);
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

    const parsedDraft = parseWorkflowKitText(newWorkflowKitText);
    if (!parsedDraft.ok) {
      setDraftParseError(parsedDraft.message);
      return;
    }
    setDraftParseError(null);

    createDefinitionMutation.mutate({
      key,
      name,
      description: description || undefined,
      workflowKit: parsedDraft.value,
    });
  }, [
    createDefinitionMutation,
    newDescription,
    newKey,
    newName,
    newWorkflowKitText,
  ]);

  return (
    <PageScaffold>
      <PageHeader
        title="Workflows"
        description="Define event-driven workflows, publish revisions, and monitor runs."
        actions={
          <Button
            className="hidden sm:inline-flex"
            onClick={() => setShowCreateModal(true)}
          >
            <Icon icon={Add01Icon} data-icon="inline-start" />
            New Workflow
            <ShortcutBadge
              shortcut="c"
              className="ml-2 hidden md:inline-flex"
            />
          </Button>
        }
      />

      <Card className="mt-6">
        <CardHeader className="border-b">
          <CardTitle>Definitions</CardTitle>
          <CardDescription>
            Search and manage workflow definitions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
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
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Revision</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-[110px] text-right">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDefinitions.map((definition) => (
                    <TableRow key={definition.id}>
                      <TableCell>
                        <div className="font-medium">{definition.name}</div>
                        {definition.description ? (
                          <div className="text-xs text-muted-foreground">
                            {definition.description}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs">{definition.key}</code>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={definitionStatusBadgeVariant(
                            definition.status,
                          )}
                        >
                          {definition.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{definition.draftRevision}</TableCell>
                      <TableCell>
                        {formatDisplayDateTime(definition.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" asChild>
                          <Link
                            to="/workflows/$workflowId"
                            params={{ workflowId: definition.id }}
                            preload="intent"
                          >
                            Open
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="border-b">
          <CardTitle>Recent Runs</CardTitle>
          <CardDescription>
            Latest execution records across all workflow definitions.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-4">
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
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-[130px] text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => {
                    const canCancel =
                      run.status === "pending" || run.status === "running";
                    const isCancelling = cancellingRunId === run.runId;
                    return (
                      <TableRow key={run.runId}>
                        <TableCell>
                          <code className="text-xs">{run.runId}</code>
                        </TableCell>
                        <TableCell>{run.workflowType}</TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground">
                            {run.entityType}
                          </div>
                          <code className="text-xs">{run.entityId}</code>
                        </TableCell>
                        <TableCell>
                          <Badge variant={runStatusBadgeVariant(run.status)}>
                            {run.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatDisplayDateTime(run.startedAt)}
                        </TableCell>
                        <TableCell>
                          {formatDisplayDateTime(run.updatedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          {canCancel ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                isCancelling || cancelRunMutation.isPending
                              }
                              onClick={() =>
                                cancelRunMutation.mutate({ runId: run.runId })
                              }
                            >
                              {isCancelling ? "Cancelling..." : "Cancel"}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              -
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EntityModal
        open={showCreateModal}
        onOpenChange={(open) => {
          setShowCreateModal(open);
          if (!open) {
            setDraftParseError(null);
          }
        }}
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
            <Label htmlFor="workflow-kit-json">WorkflowKit JSON</Label>
            <Textarea
              id="workflow-kit-json"
              value={newWorkflowKitText}
              onChange={(event) => setNewWorkflowKitText(event.target.value)}
              className="min-h-44 font-mono text-xs"
            />
            {draftParseError ? (
              <p className="text-xs text-destructive">{draftParseError}</p>
            ) : null}
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
  loader: async () => {
    const queryClient = getQueryClient();
    await swallowIgnorableRouteLoaderError(
      Promise.all([
        queryClient.ensureQueryData(
          orpc.workflows.listDefinitions.queryOptions({ input: {} }),
        ),
        queryClient.ensureQueryData(
          orpc.workflows.listRuns.queryOptions({ input: { limit: 25 } }),
        ),
      ]),
    );
  },
  component: WorkflowsIndexPage,
});
