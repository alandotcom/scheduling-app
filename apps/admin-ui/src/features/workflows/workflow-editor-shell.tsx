import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "@tanstack/react-router";
import type {
  WorkflowDefinitionDetail,
  WorkflowGraphDocument,
  WorkflowValidationResult,
} from "@scheduling/dto";
import { toast } from "sonner";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { EntityListLoadingState } from "@/components/entity-list";
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
  canonicalGraphToReferenceGraph,
  createDefaultReferenceWorkflowGraph,
  referenceGraphToCanonicalGraph,
} from "@/lib/workflows/reference-adapter";
import { orpc } from "@/lib/query";
import type {
  EditorEdge,
  EditorNode,
  RunEntityType,
  WorkflowBranch,
} from "./workflow-editor-types";
import {
  defaultActionNode,
  editorFlowToReferenceGraph,
  getTriggerSummary,
  isWorkflowBranch,
  referenceGraphToEditorFlow,
} from "./workflow-editor-utils";
import { WorkflowCanvas } from "./workflow-canvas";
import { WorkflowSidebarPanel } from "./workflow-sidebar-panel";
import { WorkflowToolbar } from "./workflow-toolbar";
// eslint-disable-next-line import/no-unassigned-import
import "@xyflow/react/dist/style.css";

interface WorkflowEditorShellProps {
  workflowId: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Operation failed";
}

export function WorkflowEditorShell({ workflowId }: WorkflowEditorShellProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const definitionQueryOptions = useMemo(
    () =>
      orpc.workflows.getDefinition.queryOptions({
        input: { id: workflowId },
      }),
    [workflowId],
  );
  const definitionQuery = useQuery(definitionQueryOptions);
  const catalogQuery = useQuery(orpc.workflows.catalog.queryOptions());
  const runsQueryOptions = useMemo(
    () =>
      orpc.workflows.listRuns.queryOptions({
        input: {
          definitionId: workflowId,
          limit: 25,
        },
      }),
    [workflowId],
  );
  const runsQuery = useQuery({
    ...runsQueryOptions,
    refetchInterval: 4000,
  });
  const appointmentsQuery = useQuery(
    orpc.appointments.list.queryOptions({
      input: {
        scope: "all",
        limit: 100,
      },
    }),
  );

  const [nodes, setNodes] = useState<EditorNode[]>([]);
  const [edges, setEdges] = useState<EditorEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [adapterError, setAdapterError] = useState<string | null>(null);
  const [validationResult, setValidationResult] =
    useState<WorkflowValidationResult | null>(null);

  const saveMutation = useMutation(
    orpc.workflows.updateDraft.mutationOptions(),
  );
  const validateMutation = useMutation(
    orpc.workflows.validateDraft.mutationOptions(),
  );
  const publishMutation = useMutation(
    orpc.workflows.publishDraft.mutationOptions(),
  );
  const runDraftMutation = useMutation(
    orpc.workflows.runDraft.mutationOptions(),
  );
  const cancelRunMutation = useMutation(
    orpc.workflows.cancelRun.mutationOptions(),
  );
  const deleteMutation = useMutation(
    orpc.workflows.deleteDefinition.mutationOptions(),
  );

  const stepLogsQuery = useQuery({
    ...orpc.workflows.listRunSteps.queryOptions({
      input: {
        runId: selectedRunId ?? "__unselected__",
      },
    }),
    enabled: selectedRunId !== null,
    refetchInterval: selectedRunId ? 4000 : false,
  });

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );
  const runs = runsQuery.data?.items ?? [];
  const actions = catalogQuery.data?.actions ?? [];

  const appointmentOptions = useMemo(() => {
    const appointments = appointmentsQuery.data?.items ?? [];
    return appointments.map((appointment) => {
      const clientName = appointment.client
        ? `${appointment.client.firstName} ${appointment.client.lastName}`.trim()
        : "Unknown client";
      const label = `${clientName} (${new Date(appointment.startAt).toLocaleDateString()})`;
      const secondary = `${appointment.status} · ${new Date(appointment.startAt).toLocaleString()}`;
      return {
        id: appointment.id,
        label,
        secondary,
      };
    });
  }, [appointmentsQuery.data?.items]);

  const firstActionId = actions[0]?.id ?? "core.emitInternalEvent";

  useEffect(() => {
    const definition = definitionQuery.data;
    if (!definition) {
      return;
    }

    try {
      const reference = canonicalGraphToReferenceGraph(
        definition.draftWorkflowGraph,
      );
      const flow = referenceGraphToEditorFlow(reference);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setAdapterError(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to adapt workflow graph for editor";
      setAdapterError(message);
      const fallbackFlow = referenceGraphToEditorFlow(
        createDefaultReferenceWorkflowGraph(),
      );
      setNodes(fallbackFlow.nodes);
      setEdges(fallbackFlow.edges);
    }

    setWorkflowName(definition.name);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedRunId(null);
    setValidationResult(null);
    setIsDirty(false);
  }, [definitionQuery.data?.id, definitionQuery.data?.draftRevision]);

  useEffect(() => {
    if (runs.length === 0) {
      setSelectedRunId(null);
      return;
    }

    if (!selectedRunId || !runs.some((run) => run.runId === selectedRunId)) {
      setSelectedRunId(runs[0]?.runId ?? null);
    }
  }, [runs, selectedRunId]);

  const markDirty = useCallback(() => {
    setIsDirty(true);
    setValidationResult(null);
  }, []);

  const updateNode = useCallback(
    (updater: (node: EditorNode) => EditorNode) => {
      if (!selectedNodeId) {
        return;
      }
      setNodes((current) =>
        current.map((node) =>
          node.id === selectedNodeId ? updater(node) : node,
        ),
      );
      markDirty();
    },
    [markDirty, selectedNodeId],
  );

  const updateEdgeBranch = useCallback(
    (branch: WorkflowBranch | undefined) => {
      if (!selectedEdgeId) {
        return;
      }
      const normalized = isWorkflowBranch(branch) ? branch : undefined;
      setEdges((current) =>
        current.map((edge) =>
          edge.id !== selectedEdgeId
            ? edge
            : {
                ...edge,
                ...(normalized
                  ? { data: { branch: normalized }, label: normalized }
                  : { data: undefined, label: undefined }),
              },
        ),
      );
      markDirty();
    },
    [markDirty, selectedEdgeId],
  );

  const saveDraft =
    useCallback(async (): Promise<WorkflowDefinitionDetail | null> => {
      if (!definitionQuery.data) {
        return null;
      }
      if (!isDirty && workflowName.trim() === definitionQuery.data.name) {
        return definitionQuery.data;
      }

      const trimmedName = workflowName.trim();
      if (trimmedName.length === 0) {
        toast.error("Workflow name is required");
        return null;
      }

      let canonicalGraph: WorkflowGraphDocument;
      try {
        const referenceGraph = editorFlowToReferenceGraph(nodes, edges);
        canonicalGraph = referenceGraphToCanonicalGraph(referenceGraph);
        setAdapterError(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to convert graph";
        setAdapterError(message);
        toast.error(message);
        return null;
      }

      try {
        const updated = await saveMutation.mutateAsync({
          id: workflowId,
          name: trimmedName,
          workflowGraph: canonicalGraph,
          expectedRevision: definitionQuery.data.draftRevision,
        });
        queryClient.setQueryData(definitionQueryOptions.queryKey, updated);
        await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
        setIsDirty(false);
        setWorkflowName(updated.name);
        toast.success("Draft saved");
        return updated;
      } catch (error) {
        toast.error(getErrorMessage(error));
        return null;
      }
    }, [
      definitionQuery.data,
      definitionQueryOptions.queryKey,
      edges,
      isDirty,
      nodes,
      queryClient,
      saveMutation,
      workflowId,
      workflowName,
    ]);

  const validateDraft = useCallback(async () => {
    const saved = await saveDraft();
    if (!saved) {
      return;
    }

    try {
      const result = await validateMutation.mutateAsync({ id: workflowId });
      setValidationResult(result);
      if (result.valid) {
        toast.success("Workflow is valid");
      } else {
        toast.error(`Validation returned ${result.issues.length} issue(s)`);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [saveDraft, validateMutation, workflowId]);

  const publishDraft = useCallback(async () => {
    const saved = await saveDraft();
    if (!saved) {
      return;
    }

    try {
      const published = await publishMutation.mutateAsync({
        id: workflowId,
        expectedRevision: saved.draftRevision,
      });
      queryClient.setQueryData(definitionQueryOptions.queryKey, published);
      await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
      setIsDirty(false);
      toast.success("Workflow published");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [
    definitionQueryOptions.queryKey,
    publishMutation,
    queryClient,
    saveDraft,
    workflowId,
  ]);

  const runDraft = useCallback(
    async (input: { entityType: RunEntityType; entityId: string }) => {
      const saved = await saveDraft();
      if (!saved) {
        return;
      }

      try {
        const response = await runDraftMutation.mutateAsync({
          id: workflowId,
          entityType: input.entityType,
          entityId: input.entityId,
        });
        await queryClient.invalidateQueries({
          queryKey: runsQueryOptions.queryKey,
        });
        const refreshedRuns = await runsQuery.refetch();
        if (refreshedRuns.data?.items[0]) {
          setSelectedRunId(refreshedRuns.data.items[0].runId);
        }
        toast.success(`Draft run queued (${response.triggerEventId})`);
      } catch (error) {
        toast.error(getErrorMessage(error));
      }
    },
    [
      queryClient,
      runDraftMutation,
      runsQuery,
      runsQueryOptions.queryKey,
      saveDraft,
      workflowId,
    ],
  );

  const cancelSelectedRun = useCallback(async () => {
    if (!selectedRunId) {
      return;
    }

    try {
      await cancelRunMutation.mutateAsync({ runId: selectedRunId });
      await queryClient.invalidateQueries({
        queryKey: runsQueryOptions.queryKey,
      });
      await runsQuery.refetch();
      await stepLogsQuery.refetch();
      toast.success("Run cancellation requested");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [
    cancelRunMutation,
    queryClient,
    runsQuery,
    runsQueryOptions.queryKey,
    selectedRunId,
    stepLogsQuery,
  ]);

  const deleteWorkflow = useCallback(async () => {
    try {
      await deleteMutation.mutateAsync({ id: workflowId });
      await queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
      toast.success("Workflow deleted");
      await navigate({ to: "/workflows" });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [deleteMutation, navigate, queryClient, workflowId]);

  if (definitionQuery.isLoading) {
    return (
      <section className="h-full w-full p-4">
        <EntityListLoadingState rows={6} cols={6} />
      </section>
    );
  }

  if (definitionQuery.error || !definitionQuery.data) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Workflow Not Found</CardTitle>
            <CardDescription>
              We could not load this workflow. It may have been removed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/workflows">
                <Icon icon={ArrowLeft01Icon} className="size-4" />
                Back to workflows
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const workflow = definitionQuery.data;
  const isMutating =
    saveMutation.isPending ||
    validateMutation.isPending ||
    publishMutation.isPending;

  return (
    <section className="flex min-h-[calc(100dvh-3.5rem)] w-full min-w-0 flex-col">
      <WorkflowToolbar
        appointmentOptions={appointmentOptions}
        isAppointmentsLoading={appointmentsQuery.isLoading}
        isDeleting={deleteMutation.isPending}
        isDirty={isDirty}
        isMutating={isMutating}
        isRunningDraft={runDraftMutation.isPending}
        onDelete={deleteWorkflow}
        onPublish={publishDraft}
        onRunDraft={runDraft}
        onSave={saveDraft}
        onValidate={validateDraft}
        onWorkflowNameChange={(name) => {
          setWorkflowName(name);
          setIsDirty(true);
        }}
        status={workflow.status}
        workflowName={workflowName}
      />

      {adapterError ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive lg:px-6">
          {adapterError}
        </div>
      ) : null}

      {validationResult && !validationResult.valid ? (
        <div className="border-b border-warning/30 bg-warning/5 px-4 py-2 text-sm text-warning-foreground lg:px-6">
          Validation issues:{" "}
          {validationResult.issues.map((issue) => issue.message).join("; ")}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 bg-muted/20">
          <WorkflowCanvas
            edges={edges}
            nodes={nodes}
            selectedEdgeId={selectedEdgeId}
            selectedNodeId={selectedNodeId}
            onAddActionAt={(position) => {
              const next = defaultActionNode(position, firstActionId);
              setNodes((current) => [...current, next]);
              setSelectedNodeId(next.id);
              setSelectedEdgeId(null);
              markDirty();
            }}
            onEdgesChange={(nextEdges) => {
              setEdges(nextEdges);
              markDirty();
            }}
            onNodesChange={(nextNodes) => {
              setNodes(nextNodes);
              markDirty();
            }}
            onSelectEdge={setSelectedEdgeId}
            onSelectNode={setSelectedNodeId}
          />
        </div>

        <WorkflowSidebarPanel
          actions={actions}
          isCancelingRun={cancelRunMutation.isPending}
          isRunsLoading={runsQuery.isLoading}
          isStepLogsLoading={stepLogsQuery.isLoading}
          runs={runs}
          selectedEdge={selectedEdge}
          selectedNode={selectedNode}
          selectedRunId={selectedRunId}
          stepLogs={stepLogsQuery.data?.items ?? []}
          onCancelRun={() => void cancelSelectedRun()}
          onDeleteEdge={() => {
            if (!selectedEdgeId) {
              return;
            }
            setEdges((current) =>
              current.filter((edge) => edge.id !== selectedEdgeId),
            );
            setSelectedEdgeId(null);
            markDirty();
          }}
          onDeleteNode={() => {
            if (!selectedNode || selectedNode.data.type === "trigger") {
              return;
            }
            setNodes((current) =>
              current.filter((node) => node.id !== selectedNode.id),
            );
            setEdges((current) =>
              current.filter(
                (edge) =>
                  edge.source !== selectedNode.id &&
                  edge.target !== selectedNode.id,
              ),
            );
            setSelectedNodeId(null);
            markDirty();
          }}
          onSelectRun={setSelectedRunId}
          onUpdateEdgeBranch={updateEdgeBranch}
          onUpdateNode={updateNode}
        />
      </div>

      <footer className="shrink-0 border-t bg-background px-4 py-2 text-xs text-muted-foreground lg:px-6">
        {getTriggerSummary(workflow.draftWorkflowGraph)}
      </footer>
    </section>
  );
}
