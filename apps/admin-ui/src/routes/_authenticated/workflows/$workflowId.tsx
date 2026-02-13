import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { forEachAsync } from "es-toolkit/array";
import { toast } from "sonner";
import {
  getCatalogTriggerEventTypes,
  getWorkflowGraphDocumentFromDraft,
  getTriggerEventTypeFromDraft,
  resolveDefaultCatalogTriggerEventType,
  stableStringify,
  WorkflowBuilder,
  withDraftGraphDocument,
  withDraftTriggerEventType,
} from "@scheduling/workflow-ui";

import type {
  WebhookEventType,
  WorkflowDefinitionStatus,
  WorkflowValidationResult,
} from "@scheduling/dto";
import { webhookEventTypes, workflowGraphDocumentSchema } from "@scheduling/dto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { formatDisplayDateTime } from "@/lib/date-utils";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/query";
// oxlint-disable-next-line import/no-unassigned-import
import "@xyflow/react/dist/style.css";

type WorkflowRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown";

function definitionStatusBadgeVariant(status: WorkflowDefinitionStatus) {
  if (status === "active") return "success";
  if (status === "draft") return "warning";
  return "outline";
}

function runStatusBadgeVariant(status: WorkflowRunStatus) {
  if (status === "completed") return "success";
  if (status === "pending" || status === "running") return "warning";
  if (status === "failed") return "destructive";
  return "outline";
}

function isWebhookEventType(value: string): value is WebhookEventType {
  return webhookEventTypes.some((eventType) => eventType === value);
}

function WorkflowDetailPage() {
  const queryClient = useQueryClient();
  const { workflowId } = Route.useParams();
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();
  const canQueryWorkflowData =
    !isSessionPending && !!session?.session.activeOrganizationId;
  const [draftWorkflowGraph, setDraftWorkflowKit] = useState<
    Record<string, unknown>
  >({});
  const [draftError, setDraftError] = useState<string | null>(null);
  const [validationResult, setValidationResult] =
    useState<WorkflowValidationResult | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [cancellingRunId, setCancellingRunId] = useState<string | null>(null);

  const definitionQuery = useQuery({
    ...orpc.workflows.getDefinition.queryOptions({
      input: { id: workflowId },
    }),
    enabled: canQueryWorkflowData,
    placeholderData: (previous) => previous,
  });
  const runsQuery = useQuery({
    ...orpc.workflows.listRuns.queryOptions({
      input: {
        definitionId: workflowId,
        limit: 50,
      },
    }),
    enabled: canQueryWorkflowData,
    placeholderData: (previous) => previous,
  });
  const selectedRunQuery = useQuery({
    ...orpc.workflows.getRun.queryOptions({
      input: { runId: selectedRunId! },
    }),
    enabled: canQueryWorkflowData && !!selectedRunId,
  });
  const catalogQuery = useQuery({
    ...orpc.workflows.catalog.queryOptions(),
    enabled: canQueryWorkflowData,
    placeholderData: (previous) => previous,
  });

  const definition = definitionQuery.data;
  const runs = runsQuery.data?.items ?? [];
  const availableTriggerEventTypes = useMemo(
    () =>
      getCatalogTriggerEventTypes(
        catalogQuery.data?.triggers ?? [],
        webhookEventTypes,
      ).filter(isWebhookEventType),
    [catalogQuery.data?.triggers],
  );

  useEffect(() => {
    if (!definition) return;
    setDraftWorkflowKit(definition.draftWorkflowGraph);
    setDraftError(null);
  }, [definition?.id, definition?.draftRevision]);

  useEffect(() => {
    if (!selectedRunId) return;
    if (runs.some((run) => run.runId === selectedRunId)) return;
    setSelectedRunId(null);
  }, [runs, selectedRunId]);

  const parsedDraft = useMemo(
    () => workflowGraphDocumentSchema.safeParse(draftWorkflowGraph),
    [draftWorkflowGraph],
  );
  const isDraftDirty = useMemo(() => {
    if (!definition) return false;
    if (!parsedDraft.success) return true;
    return (
      stableStringify(parsedDraft.data) !==
      stableStringify(definition.draftWorkflowGraph)
    );
  }, [definition, parsedDraft]);
  const triggerEventType = useMemo(
    () =>
      getTriggerEventTypeFromDraft(
        parsedDraft.success ? parsedDraft.data : draftWorkflowGraph,
        definition?.bindings[0]?.eventType ??
          resolveDefaultCatalogTriggerEventType(
            catalogQuery.data?.triggers ?? [],
            availableTriggerEventTypes[0] ?? webhookEventTypes[0],
          ),
      ),
    [
      availableTriggerEventTypes,
      catalogQuery.data?.triggers,
      definition,
      draftWorkflowGraph,
      parsedDraft,
    ],
  );
  const workflowGraph = useMemo(
    () =>
      getWorkflowGraphDocumentFromDraft(
        parsedDraft.success ? parsedDraft.data : draftWorkflowGraph,
      ),
    [draftWorkflowGraph, parsedDraft],
  );

  const updateDraftMutation = useMutation(
    orpc.workflows.updateDraft.mutationOptions({
      onSuccess: async (updated) => {
        await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
        setDraftWorkflowKit(updated.draftWorkflowGraph);
        setValidationResult(null);
        toast.success("Draft saved");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to save draft");
      },
    }),
  );

  const validateMutation = useMutation(
    orpc.workflows.validateDraft.mutationOptions({
      onSuccess: (result) => {
        setValidationResult(result);
        if (result.valid) {
          toast.success("Draft is valid");
        } else {
          toast.error("Draft validation failed");
        }
      },
      onError: (error) => {
        toast.error(error.message || "Failed to validate draft");
      },
    }),
  );

  const publishMutation = useMutation(
    orpc.workflows.publishDraft.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
        setValidationResult(null);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to publish workflow");
      },
    }),
  );

  const upsertBindingMutation = useMutation(
    orpc.workflows.bindings.upsert.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to upsert binding");
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

  const ensureSavedDraft = useCallback(async () => {
    if (!definition) return { ok: false as const };
    const parsed = workflowGraphDocumentSchema.safeParse(draftWorkflowGraph);
    if (!parsed.success) {
      setDraftError("Workflow draft is invalid.");
      return { ok: false as const };
    }

    setDraftError(null);
    if (!isDraftDirty) {
      return { ok: true as const, revision: definition.draftRevision };
    }

    try {
      const updated = await updateDraftMutation.mutateAsync({
        id: workflowId,
        workflowGraph: parsed.data,
        expectedRevision: definition.draftRevision,
      });
      return { ok: true as const, revision: updated.draftRevision };
    } catch {
      return { ok: false as const };
    }
  }, [
    definition,
    draftWorkflowGraph,
    isDraftDirty,
    updateDraftMutation,
    workflowId,
  ]);

  const handleSaveDraft = useCallback(async () => {
    const result = await ensureSavedDraft();
    if (!result.ok && !draftError) {
      toast.error("Unable to save draft");
    }
  }, [draftError, ensureSavedDraft]);

  const handleValidateDraft = useCallback(async () => {
    const result = await ensureSavedDraft();
    if (!result.ok) return;
    validateMutation.mutate({ id: workflowId });
  }, [ensureSavedDraft, validateMutation, workflowId]);

  const syncActiveBindingsWithTrigger = useCallback(async () => {
    if (!definition) return;

    await forEachAsync(
      definition.bindings,
      async (binding) => {
        if (binding.eventType === triggerEventType && binding.enabled) {
          return;
        }

        if (binding.eventType !== triggerEventType && !binding.enabled) {
          return;
        }

        await upsertBindingMutation.mutateAsync({
          id: workflowId,
          eventType: binding.eventType,
          enabled: binding.eventType === triggerEventType,
        });
      },
      { concurrency: 1 },
    );

    if (
      !definition.bindings.some(
        (binding) => binding.eventType === triggerEventType,
      )
    ) {
      await upsertBindingMutation.mutateAsync({
        id: workflowId,
        eventType: triggerEventType,
        enabled: true,
      });
    }
  }, [definition, triggerEventType, upsertBindingMutation, workflowId]);

  const handlePublishDraft = useCallback(async () => {
    const result = await ensureSavedDraft();
    if (!result.ok) return;

    try {
      await publishMutation.mutateAsync({
        id: workflowId,
        expectedRevision: result.revision,
      });
    } catch {
      return;
    }

    try {
      await syncActiveBindingsWithTrigger();
      toast.success(`Workflow published for ${triggerEventType}`);
    } catch {
      toast.error(
        `Workflow was published, but activating trigger '${triggerEventType}' failed.`,
      );
    }
  }, [
    ensureSavedDraft,
    publishMutation,
    syncActiveBindingsWithTrigger,
    triggerEventType,
    workflowId,
  ]);

  const anyMutationPending =
    updateDraftMutation.isPending ||
    publishMutation.isPending ||
    validateMutation.isPending ||
    upsertBindingMutation.isPending;

  if (!canQueryWorkflowData) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Loading organization context...
        </p>
      </div>
    );
  }

  if (definitionQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading workflow...</p>
      </div>
    );
  }

  if (definitionQuery.error || !definition) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-destructive">Workflow not found</p>
      </div>
    );
  }

  const runsPanel = (
    <div className="space-y-3">
      {runsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading runs...</p>
      ) : runsQuery.error ? (
        <p className="text-sm text-destructive">Failed to load runs</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No runs for this workflow yet.
        </p>
      ) : (
        <div className="space-y-1">
          {runs.map((run) => {
            const canCancel =
              run.status === "pending" || run.status === "running";
            const isCancelling = cancellingRunId === run.runId;
            return (
              <button
                key={run.runId}
                type="button"
                className={`w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors ${selectedRunId === run.runId ? "bg-accent" : "hover:bg-accent/50"}`}
                onClick={() => setSelectedRunId(run.runId)}
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant={runStatusBadgeVariant(run.status)}
                    className="text-[10px]"
                  >
                    {run.status}
                  </Badge>
                  <span className="truncate text-muted-foreground">
                    {formatDisplayDateTime(run.startedAt)}
                  </span>
                </div>
                <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                  {run.runId}
                </p>
                {canCancel ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 h-6 px-2 text-[10px]"
                    disabled={cancelRunMutation.isPending || isCancelling}
                    onClick={(e) => {
                      e.stopPropagation();
                      cancelRunMutation.mutate({ runId: run.runId });
                    }}
                  >
                    {isCancelling ? "Cancelling..." : "Cancel"}
                  </Button>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {selectedRunId ? (
        <div className="rounded-md border border-border p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">Run details</p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-1.5"
                disabled={selectedRunQuery.isFetching}
                onClick={() => void selectedRunQuery.refetch()}
              >
                <Icon icon={RefreshIcon} className="size-3" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px]"
                onClick={() => setSelectedRunId(null)}
              >
                Clear
              </Button>
            </div>
          </div>
          {selectedRunQuery.isLoading ? (
            <p className="mt-1 text-xs text-muted-foreground">Loading...</p>
          ) : selectedRunQuery.error ? (
            <p className="mt-1 text-xs text-destructive">
              Failed to load run details
            </p>
          ) : selectedRunQuery.data ? (
            <dl className="mt-2 space-y-1 text-xs">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge
                    variant={runStatusBadgeVariant(
                      selectedRunQuery.data.status,
                    )}
                    className="text-[10px]"
                  >
                    {selectedRunQuery.data.status}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Workflow Type</dt>
                <dd>{selectedRunQuery.data.workflowType}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Revision</dt>
                <dd>{selectedRunQuery.data.runRevision}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Started</dt>
                <dd>
                  {formatDisplayDateTime(selectedRunQuery.data.startedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Updated</dt>
                <dd>
                  {formatDisplayDateTime(selectedRunQuery.data.updatedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Entity</dt>
                <dd>
                  {selectedRunQuery.data.entityType}{" "}
                  <code className="font-mono text-[10px]">
                    {selectedRunQuery.data.entityId}
                  </code>
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}

      {validationResult ? (
        <div className="rounded-md border border-border p-2">
          <p className="text-xs font-medium">
            Validation {validationResult.valid ? "passed" : "failed"}
          </p>
          {validationResult.issues.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-xs">
              {validationResult.issues.map((issue, index) => (
                <li key={`${issue.code}-${issue.field ?? "field"}-${index}`}>
                  <span className="font-medium">{issue.severity}</span>:{" "}
                  {issue.message}
                  {issue.field ? (
                    <span className="text-muted-foreground">
                      {" "}
                      ({issue.field})
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top toolbar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/workflows">
              <Icon icon={ArrowLeft01Icon} className="size-4" />
            </Link>
          </Button>
          <span className="truncate text-sm font-medium">
            {definition.name}
          </span>
          <Badge
            variant={definitionStatusBadgeVariant(definition.status)}
            className="shrink-0"
          >
            {definition.status}
          </Badge>
          <Badge variant="secondary" className="shrink-0">
            Rev {definition.draftRevision}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={anyMutationPending}
          >
            {updateDraftMutation.isPending ? "Saving..." : "Save Draft"}
            {isDraftDirty ? (
              <span className="ml-1.5 inline-block size-1.5 rounded-full bg-orange-500" />
            ) : null}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleValidateDraft}
            disabled={anyMutationPending}
          >
            {validateMutation.isPending ? "Validating..." : "Validate"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handlePublishDraft}
            disabled={anyMutationPending}
          >
            {publishMutation.isPending || upsertBindingMutation.isPending
              ? "Publishing..."
              : "Publish"}
          </Button>
        </div>
      </div>

      {/* Canvas fills remaining space */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <WorkflowBuilder
          document={workflowGraph}
          actionCatalog={catalogQuery.data?.actions ?? []}
          triggerEventType={triggerEventType}
          availableTriggerEventTypes={availableTriggerEventTypes}
          onTriggerEventTypeChange={(eventType) => {
            setDraftWorkflowKit((current) =>
              withDraftTriggerEventType(current, eventType),
            );
            setDraftError(null);
            setValidationResult(null);
          }}
          onChange={(updatedWorkflow) => {
            setDraftWorkflowKit((current) =>
              withDraftGraphDocument(
                withDraftTriggerEventType(current, triggerEventType),
                updatedWorkflow,
              ),
            );
            setDraftError(null);
            setValidationResult(null);
          }}
          sidebarExtra={runsPanel}
        />
      </div>

      {/* Draft error toast-style inline (only when not parseable) */}
      {draftError || (!parsedDraft.success && !draftError) ? (
        <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive shadow-lg">
          {draftError || "Workflow draft is invalid."}
        </div>
      ) : null}
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/workflows/$workflowId")({
  component: WorkflowDetailPage,
});
