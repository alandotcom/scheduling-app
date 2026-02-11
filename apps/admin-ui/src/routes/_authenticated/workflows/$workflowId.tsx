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
import { webhookEventTypes, workflowKitDocumentSchema } from "@scheduling/dto";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  const [draftWorkflowKit, setDraftWorkflowKit] = useState<
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
    setDraftWorkflowKit(definition.draftWorkflowKit);
    setDraftError(null);
  }, [definition?.id, definition?.draftRevision]);

  useEffect(() => {
    if (!selectedRunId) return;
    if (runs.some((run) => run.runId === selectedRunId)) return;
    setSelectedRunId(null);
  }, [runs, selectedRunId]);

  const parsedDraft = useMemo(
    () => workflowKitDocumentSchema.safeParse(draftWorkflowKit),
    [draftWorkflowKit],
  );
  const isDraftDirty = useMemo(() => {
    if (!definition) return false;
    if (!parsedDraft.success) return true;
    return (
      stableStringify(parsedDraft.data) !==
      stableStringify(definition.draftWorkflowKit)
    );
  }, [definition, parsedDraft]);
  const triggerEventType = useMemo(
    () =>
      getTriggerEventTypeFromDraft(
        parsedDraft.success ? parsedDraft.data : draftWorkflowKit,
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
      draftWorkflowKit,
      parsedDraft,
    ],
  );
  const workflowGraph = useMemo(
    () =>
      getWorkflowGraphDocumentFromDraft(
        parsedDraft.success ? parsedDraft.data : draftWorkflowKit,
      ),
    [draftWorkflowKit, parsedDraft],
  );

  const updateDraftMutation = useMutation(
    orpc.workflows.updateDraft.mutationOptions({
      onSuccess: async (updated) => {
        await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
        setDraftWorkflowKit(updated.draftWorkflowKit);
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
    const parsed = workflowKitDocumentSchema.safeParse(draftWorkflowKit);
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
        workflowKit: parsed.data,
        expectedRevision: definition.draftRevision,
      });
      return { ok: true as const, revision: updated.draftRevision };
    } catch {
      return { ok: false as const };
    }
  }, [
    definition,
    draftWorkflowKit,
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

  if (!canQueryWorkflowData) {
    return (
      <PageScaffold className="max-w-none">
        <div className="text-sm text-muted-foreground">
          Loading organization context...
        </div>
      </PageScaffold>
    );
  }

  if (definitionQuery.isLoading) {
    return (
      <PageScaffold className="max-w-none">
        <div className="text-sm text-muted-foreground">Loading workflow...</div>
      </PageScaffold>
    );
  }

  if (definitionQuery.error || !definition) {
    return (
      <PageScaffold className="max-w-none">
        <div className="text-sm text-destructive">Workflow not found</div>
      </PageScaffold>
    );
  }

  return (
    <PageScaffold className="max-w-none">
      <PageHeader
        title={definition.name}
        description={definition.description ?? "No description"}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/workflows">
                <Icon icon={ArrowLeft01Icon} data-icon="inline-start" />
                Back
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline">{definition.key}</Badge>
        <Badge variant={definitionStatusBadgeVariant(definition.status)}>
          {definition.status}
        </Badge>
        <Badge variant="secondary">Revision {definition.draftRevision}</Badge>
        {definition.activeVersion ? (
          <Badge variant="secondary">
            Active v{definition.activeVersion.version}
          </Badge>
        ) : (
          <Badge variant="outline">No active version</Badge>
        )}
      </div>

      <Card className="mt-4">
        <CardHeader className="border-b">
          <CardTitle>Draft Workflow</CardTitle>
          <CardDescription>
            Edit visually, validate, and publish new workflow revisions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <p className="text-sm text-muted-foreground">
              Configure trigger and steps directly on the canvas.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={
                  updateDraftMutation.isPending ||
                  publishMutation.isPending ||
                  upsertBindingMutation.isPending
                }
              >
                {updateDraftMutation.isPending ? "Saving..." : "Save Draft"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleValidateDraft}
                disabled={
                  updateDraftMutation.isPending ||
                  validateMutation.isPending ||
                  publishMutation.isPending ||
                  upsertBindingMutation.isPending
                }
              >
                {validateMutation.isPending ? "Validating..." : "Validate"}
              </Button>
              <Button
                type="button"
                onClick={handlePublishDraft}
                disabled={
                  updateDraftMutation.isPending ||
                  publishMutation.isPending ||
                  validateMutation.isPending ||
                  upsertBindingMutation.isPending
                }
              >
                {publishMutation.isPending || upsertBindingMutation.isPending
                  ? "Publishing..."
                  : "Publish Draft"}
              </Button>
              {isDraftDirty ? (
                <Badge variant="warning">Unsaved changes</Badge>
              ) : (
                <Badge variant="success">Saved</Badge>
              )}
            </div>
          </div>
          <div
            className="overflow-hidden rounded-lg border border-border"
            style={{ minHeight: "40rem", height: "calc(100dvh - 21rem)" }}
          >
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
            />
          </div>
          {draftError ? (
            <p className="text-sm text-destructive">{draftError}</p>
          ) : null}
          {!parsedDraft.success && !draftError ? (
            <p className="text-sm text-destructive">
              Workflow draft is invalid.
            </p>
          ) : null}
          {validationResult ? (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-sm font-medium">
                Validation {validationResult.valid ? "passed" : "failed"}
              </p>
              {validationResult.issues.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {validationResult.issues.map((issue, index) => (
                    <li
                      key={`${issue.code}-${issue.field ?? "field"}-${index}`}
                    >
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
        </CardContent>
      </Card>

      <div className="mt-6">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Runs</CardTitle>
            <CardDescription>
              Recent runs for this workflow and runtime status details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 py-4">
            {runsQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">
                Loading runs...
              </div>
            ) : runsQuery.error ? (
              <div className="text-sm text-destructive">
                Failed to load runs
              </div>
            ) : runs.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No runs for this workflow yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="w-[170px] text-right">
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
                            <button
                              type="button"
                              className="text-left font-mono text-xs text-primary hover:underline"
                              onClick={() => setSelectedRunId(run.runId)}
                            >
                              {run.runId}
                            </button>
                          </TableCell>
                          <TableCell>
                            <Badge variant={runStatusBadgeVariant(run.status)}>
                              {run.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs text-muted-foreground">
                              {run.entityType}
                            </div>
                            <code className="text-xs">{run.entityId}</code>
                          </TableCell>
                          <TableCell>
                            {formatDisplayDateTime(run.startedAt)}
                          </TableCell>
                          <TableCell>
                            {formatDisplayDateTime(run.updatedAt)}
                          </TableCell>
                          <TableCell className="space-x-2 text-right">
                            {canCancel ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  cancelRunMutation.isPending || isCancelling
                                }
                                onClick={() =>
                                  cancelRunMutation.mutate({ runId: run.runId })
                                }
                              >
                                {isCancelling ? "Cancelling..." : "Cancel"}
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {selectedRunId ? (
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Run details</p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={selectedRunQuery.isFetching}
                      onClick={() => void selectedRunQuery.refetch()}
                    >
                      <Icon icon={RefreshIcon} data-icon="inline-start" />
                      Refresh
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedRunId(null)}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                {selectedRunQuery.isLoading ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Loading run details...
                  </p>
                ) : selectedRunQuery.error ? (
                  <p className="mt-2 text-sm text-destructive">
                    Failed to load run details
                  </p>
                ) : selectedRunQuery.data ? (
                  <dl className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Run ID</dt>
                      <dd className="font-mono text-xs">
                        {selectedRunQuery.data.runId}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Workflow Type</dt>
                      <dd>{selectedRunQuery.data.workflowType}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Status</dt>
                      <dd>
                        <Badge
                          variant={runStatusBadgeVariant(
                            selectedRunQuery.data.status,
                          )}
                        >
                          {selectedRunQuery.data.status}
                        </Badge>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Run Revision</dt>
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
                      <dt className="text-muted-foreground">Entity Type</dt>
                      <dd>{selectedRunQuery.data.entityType}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Entity ID</dt>
                      <dd className="font-mono text-xs">
                        {selectedRunQuery.data.entityId}
                      </dd>
                    </div>
                  </dl>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PageScaffold>
  );
}

export const Route = createFileRoute("/_authenticated/workflows/$workflowId")({
  component: WorkflowDetailPage,
});
