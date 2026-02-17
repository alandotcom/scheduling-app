import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { ReactFlowProvider } from "@xyflow/react";
import { toast } from "sonner";
import { useAtomValue, useSetAtom } from "jotai";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Panel } from "@/components/flow-elements/panel";
import { PageScaffold } from "@/components/layout/page-scaffold";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { canManageWorkflowsForRole } from "@/features/workflows/workflow-list-page";
import { WorkflowEditorCanvas } from "@/features/workflows/workflow-editor-canvas";
import { WorkflowEditorSidebar } from "@/features/workflows/workflow-editor-sidebar";
import { WorkflowSidebarPanel } from "@/features/workflows/workflow-sidebar-panel";
import { WorkflowToolbar } from "@/features/workflows/workflow-toolbar";
import {
  deleteEdgeAtom,
  deleteNodeAtom,
  redoAtom,
  serializeWorkflowGraph,
  setWorkflowEditorActionTypeAtom,
  setWorkflowEditorGraphAtom,
  undoAtom,
  updateWorkflowEditorNodeDataAtom,
  workflowEditorEdgesAtom,
  workflowEditorHasUnsavedChangesAtom,
  workflowEditorIsLoadedAtom,
  workflowEditorIsReadOnlyAtom,
  workflowEditorIsSavingAtom,
  workflowEditorNodesAtom,
  workflowEditorSelectedEdgeIdAtom,
  workflowEditorSelectedNodeIdAtom,
  workflowEditorWorkflowIdAtom,
} from "@/features/workflows/workflow-editor-store";
import { getQueryClient, orpc } from "@/lib/query";
import { swallowIgnorableRouteLoaderError } from "@/lib/query-cancellation";

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Failed to load journey editor.";
}

function WorkflowEditorPage() {
  const { workflowId } = Route.useParams();
  const queryClient = useQueryClient();

  const authContextQuery = useQuery({
    ...orpc.auth.me.queryOptions({}),
    retry: false,
  });
  const journeyQuery = useQuery({
    ...orpc.journeys.get.queryOptions({ input: { id: workflowId } }),
    retry: false,
  });

  const nodes = useAtomValue(workflowEditorNodesAtom);
  const edges = useAtomValue(workflowEditorEdgesAtom);
  const hasUnsavedChanges = useAtomValue(workflowEditorHasUnsavedChangesAtom);
  const isSaving = useAtomValue(workflowEditorIsSavingAtom);
  const isLoaded = useAtomValue(workflowEditorIsLoadedAtom);
  const selectedNodeId = useAtomValue(workflowEditorSelectedNodeIdAtom);
  const selectedEdgeId = useAtomValue(workflowEditorSelectedEdgeIdAtom);

  const setGraph = useSetAtom(setWorkflowEditorGraphAtom);
  const setIsReadOnly = useSetAtom(workflowEditorIsReadOnlyAtom);
  const setHasUnsavedChanges = useSetAtom(workflowEditorHasUnsavedChangesAtom);
  const setIsSaving = useSetAtom(workflowEditorIsSavingAtom);
  const setWorkflowId = useSetAtom(workflowEditorWorkflowIdAtom);
  const updateNodeData = useSetAtom(updateWorkflowEditorNodeDataAtom);
  const setActionType = useSetAtom(setWorkflowEditorActionTypeAtom);
  const deleteNode = useSetAtom(deleteNodeAtom);
  const deleteEdge = useSetAtom(deleteEdgeAtom);
  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );
  const [publishWarnings, setPublishWarnings] = useState<string[]>([]);

  const canManageWorkflow = canManageWorkflowsForRole(
    authContextQuery.data?.role,
  );

  useEffect(() => {
    setIsReadOnly(!canManageWorkflow);
  }, [canManageWorkflow, setIsReadOnly]);

  useEffect(() => {
    if (!journeyQuery.data) {
      return;
    }

    setGraph(journeyQuery.data.graph);
    setWorkflowId(journeyQuery.data.id);
  }, [journeyQuery.data, setGraph, setWorkflowId]);

  const updateMutation = useMutation(
    orpc.journeys.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.journeys.key() });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to save journey draft");
      },
    }),
  );

  const publishMutation = useMutation(
    orpc.journeys.publish.mutationOptions({
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: orpc.journeys.key() });
        setPublishWarnings(result.warnings);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to publish journey");
      },
    }),
  );

  const pauseMutation = useMutation(
    orpc.journeys.pause.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.journeys.key() });
        setPublishWarnings([]);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to pause journey");
      },
    }),
  );

  const resumeMutation = useMutation(
    orpc.journeys.resume.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.journeys.key() });
        setPublishWarnings([]);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to resume journey");
      },
    }),
  );

  const graph = useMemo(
    () => serializeWorkflowGraph({ nodes, edges }),
    [nodes, edges],
  );

  const saveJourney = useCallback(async () => {
    if (!isLoaded || !canManageWorkflow) {
      return;
    }

    setIsSaving(true);
    try {
      await updateMutation.mutateAsync({
        id: workflowId,
        data: { graph },
      });
      setHasUnsavedChanges(false);
    } finally {
      setIsSaving(false);
    }
  }, [
    canManageWorkflow,
    graph,
    isLoaded,
    setHasUnsavedChanges,
    setIsSaving,
    updateMutation,
    workflowId,
  ]);

  const handlePublish = useCallback(
    async (mode: "live" | "test") => {
      if (!canManageWorkflow) {
        return;
      }

      if (hasUnsavedChanges) {
        await saveJourney();
      }

      await publishMutation.mutateAsync({
        id: workflowId,
        data: { mode },
      });
    },
    [
      canManageWorkflow,
      hasUnsavedChanges,
      publishMutation,
      saveJourney,
      workflowId,
    ],
  );

  const handlePause = useCallback(async () => {
    if (!canManageWorkflow) {
      return;
    }

    await pauseMutation.mutateAsync({ id: workflowId });
  }, [canManageWorkflow, pauseMutation, workflowId]);

  const handleResume = useCallback(
    async (targetState: "published" | "test_only") => {
      if (!canManageWorkflow) {
        return;
      }

      await resumeMutation.mutateAsync({
        id: workflowId,
        data: { targetState },
      });
    },
    [canManageWorkflow, resumeMutation, workflowId],
  );

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: ["meta+s", "ctrl+s"],
        action: () => {
          if (hasUnsavedChanges) {
            void saveJourney();
          }
        },
        description: "Save journey",
        ignoreInputs: false,
      },
      {
        key: ["meta+z", "ctrl+z"],
        action: () => undo(),
        description: "Undo",
        ignoreInputs: false,
      },
      {
        key: ["meta+shift+z", "ctrl+shift+z"],
        action: () => redo(),
        description: "Redo",
        ignoreInputs: false,
      },
    ],
    enabled: canManageWorkflow,
  });

  if (journeyQuery.isLoading || authContextQuery.isLoading) {
    return (
      <PageScaffold className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Loading journey editor...
        </p>
      </PageScaffold>
    );
  }

  if (journeyQuery.error) {
    return (
      <PageScaffold className="space-y-4">
        <p className="text-sm text-destructive">
          {resolveErrorMessage(journeyQuery.error)}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/workflows">Back to journeys</Link>
        </Button>
      </PageScaffold>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden">
      <WorkflowEditorCanvas canEdit={canManageWorkflow}>
        <Panel className="flex items-center gap-2" position="top-left">
          <Button
            asChild
            size="icon-sm"
            title="Back to journeys"
            variant="outline"
          >
            <Link to="/workflows">
              <Icon icon={ArrowLeft02Icon} />
            </Link>
          </Button>
        </Panel>

        <WorkflowToolbar
          canManageWorkflow={canManageWorkflow}
          journeyState={journeyQuery.data?.state ?? "draft"}
          publishWarnings={publishWarnings}
          isPausing={pauseMutation.isPending}
          isPublishing={publishMutation.isPending}
          isResuming={resumeMutation.isPending}
          isSaving={isSaving}
          onPause={() => void handlePause()}
          onPublish={(mode) => void handlePublish(mode)}
          onResume={(targetState) => void handleResume(targetState)}
          onSave={() => void saveJourney()}
        />
      </WorkflowEditorCanvas>

      <WorkflowSidebarPanel>
        <WorkflowEditorSidebar
          canManageWorkflow={canManageWorkflow}
          edges={edges}
          nodes={nodes}
          onDeleteEdge={canManageWorkflow ? deleteEdge : undefined}
          onDeleteNode={canManageWorkflow ? deleteNode : undefined}
          onSetActionType={setActionType}
          onUpdateNodeData={updateNodeData}
          selectedEdge={selectedEdge}
          selectedNode={selectedNode}
          workflowId={journeyQuery.data?.id ?? null}
        />
      </WorkflowSidebarPanel>
    </div>
  );
}

function WorkflowEditorPageWrapper() {
  return (
    <ReactFlowProvider>
      <WorkflowEditorPage />
    </ReactFlowProvider>
  );
}

export const Route = createFileRoute("/_authenticated/workflows/$workflowId")({
  loader: async ({ params }) => {
    const queryClient = getQueryClient();
    await swallowIgnorableRouteLoaderError(
      Promise.all([
        queryClient.ensureQueryData(orpc.auth.me.queryOptions({})),
        queryClient.ensureQueryData(
          orpc.journeys.get.queryOptions({
            input: { id: params.workflowId },
          }),
        ),
      ]),
    );
  },
  component: WorkflowEditorPageWrapper,
});
