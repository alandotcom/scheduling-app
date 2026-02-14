import { useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { useAtomValue, useSetAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageScaffold } from "@/components/layout/page-scaffold";
import { canManageWorkflowsForRole } from "@/features/workflows/workflow-list-page";
import { WorkflowEditorCanvas } from "@/features/workflows/workflow-editor-canvas";
import { WorkflowEditorSidebar } from "@/features/workflows/workflow-editor-sidebar";
import {
  addWorkflowEditorActionNodeAtom,
  serializeWorkflowGraph,
  setWorkflowEditorGraphAtom,
  workflowEditorEdgesAtom,
  workflowEditorHasUnsavedChangesAtom,
  workflowEditorIsLoadedAtom,
  workflowEditorIsReadOnlyAtom,
  workflowEditorIsSavingAtom,
  workflowEditorNodesAtom,
  workflowEditorSelectedNodeIdAtom,
  workflowEditorWorkflowIdAtom,
  updateWorkflowEditorNodeDataAtom,
} from "@/features/workflows/workflow-editor-store";
import { getQueryClient, orpc } from "@/lib/query";
import { swallowIgnorableRouteLoaderError } from "@/lib/query-cancellation";

const AUTOSAVE_DELAY_MS = 1000;

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Failed to load workflow editor.";
}

function WorkflowEditorPage() {
  const { workflowId } = Route.useParams();
  const isCurrentWorkflowDraft = workflowId === "current";
  const queryClient = useQueryClient();

  const authContextQuery = useQuery({
    ...orpc.auth.me.queryOptions({}),
    retry: false,
  });
  const workflowQuery = useQuery({
    ...(isCurrentWorkflowDraft
      ? orpc.workflows.current.get.queryOptions({})
      : orpc.workflows.get.queryOptions({
          input: { id: workflowId },
        })),
    retry: false,
  });

  const nodes = useAtomValue(workflowEditorNodesAtom);
  const edges = useAtomValue(workflowEditorEdgesAtom);
  const hasUnsavedChanges = useAtomValue(workflowEditorHasUnsavedChangesAtom);
  const isSaving = useAtomValue(workflowEditorIsSavingAtom);
  const isLoaded = useAtomValue(workflowEditorIsLoadedAtom);
  const selectedNodeId = useAtomValue(workflowEditorSelectedNodeIdAtom);

  const setGraph = useSetAtom(setWorkflowEditorGraphAtom);
  const setIsReadOnly = useSetAtom(workflowEditorIsReadOnlyAtom);
  const setHasUnsavedChanges = useSetAtom(workflowEditorHasUnsavedChangesAtom);
  const setIsSaving = useSetAtom(workflowEditorIsSavingAtom);
  const setWorkflowId = useSetAtom(workflowEditorWorkflowIdAtom);
  const addActionNode = useSetAtom(addWorkflowEditorActionNodeAtom);
  const updateNodeData = useSetAtom(updateWorkflowEditorNodeDataAtom);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const canManageByRole = canManageWorkflowsForRole(
    authContextQuery.data?.role,
  );
  const workflowOwnershipAllowsEdit =
    isCurrentWorkflowDraft ||
    (workflowQuery.data && "isOwner" in workflowQuery.data
      ? workflowQuery.data.isOwner !== false
      : true);
  const canManageWorkflow = canManageByRole && workflowOwnershipAllowsEdit;

  useEffect(() => {
    setIsReadOnly(!canManageWorkflow);
  }, [canManageWorkflow, setIsReadOnly]);

  useEffect(() => {
    if (!workflowQuery.data) return;
    setGraph(workflowQuery.data.graph);
    setWorkflowId(workflowQuery.data.id ?? null);
  }, [setGraph, setWorkflowId, workflowQuery.data]);

  const updateMutation = useMutation(
    orpc.workflows.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to save workflow draft");
      },
    }),
  );

  const saveCurrentMutation = useMutation(
    orpc.workflows.current.save.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to save workflow draft");
      },
    }),
  );

  const graph = useMemo(
    () =>
      serializeWorkflowGraph({
        nodes,
        edges,
      }),
    [nodes, edges],
  );

  useEffect(() => {
    if (!isLoaded || !hasUnsavedChanges || !canManageWorkflow) return;

    const timeoutId = setTimeout(async () => {
      setIsSaving(true);
      try {
        if (isCurrentWorkflowDraft) {
          const saved = await saveCurrentMutation.mutateAsync({ graph });
          setWorkflowId(saved.id ?? null);
        } else {
          await updateMutation.mutateAsync({
            id: workflowId,
            data: { graph },
          });
        }
        setHasUnsavedChanges(false);
      } finally {
        setIsSaving(false);
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    canManageWorkflow,
    graph,
    hasUnsavedChanges,
    isCurrentWorkflowDraft,
    isLoaded,
    saveCurrentMutation,
    setHasUnsavedChanges,
    setIsSaving,
    setWorkflowId,
    updateMutation,
    workflowId,
  ]);

  if (workflowQuery.isLoading || authContextQuery.isLoading) {
    return (
      <PageScaffold className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Loading workflow editor…
        </p>
      </PageScaffold>
    );
  }

  if (workflowQuery.error) {
    return (
      <PageScaffold className="space-y-4">
        <p className="text-sm text-destructive">
          {resolveErrorMessage(workflowQuery.error)}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/workflows">Back to workflows</Link>
        </Button>
      </PageScaffold>
    );
  }

  return (
    <PageScaffold className="space-y-4 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Workflow editor
          </h1>
          <p className="text-sm text-muted-foreground">
            {canManageWorkflow
              ? isSaving
                ? "Autosaving changes..."
                : hasUnsavedChanges
                  ? "Unsaved changes"
                  : "All changes saved"
              : "Read-only access for your role."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManageWorkflow ? (
            <Button onClick={() => addActionNode()} size="sm" variant="outline">
              <Icon icon={Add01Icon} className="size-4" />
              Add action node
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link to="/workflows">Back</Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),380px]">
        <WorkflowEditorCanvas canEdit={canManageWorkflow} />
        <WorkflowEditorSidebar
          canManageWorkflow={canManageWorkflow}
          onUpdateNodeData={updateNodeData}
          selectedNode={selectedNode}
          workflowId={workflowQuery.data?.id ?? null}
        />
      </div>
    </PageScaffold>
  );
}

export const Route = createFileRoute("/_authenticated/workflows/$workflowId")({
  loader: async ({ params }) => {
    const queryClient = getQueryClient();
    await swallowIgnorableRouteLoaderError(
      Promise.all([
        queryClient.ensureQueryData(orpc.auth.me.queryOptions({})),
        params.workflowId === "current"
          ? queryClient.ensureQueryData(
              orpc.workflows.current.get.queryOptions({}),
            )
          : queryClient.ensureQueryData(
              orpc.workflows.get.queryOptions({
                input: { id: params.workflowId },
              }),
            ),
      ]),
    );
  },
  component: WorkflowEditorPage,
});
