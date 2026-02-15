import { useCallback, useEffect, useMemo } from "react";
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
  setWorkflowEditorGraphAtom,
  setWorkflowEditorActionTypeAtom,
  undoAtom,
  workflowEditorEdgesAtom,
  workflowEditorHasUnsavedChangesAtom,
  workflowEditorIsLoadedAtom,
  workflowEditorIsReadOnlyAtom,
  workflowEditorIsSavingAtom,
  workflowEditorNodesAtom,
  workflowEditorSelectedEdgeIdAtom,
  workflowEditorSelectedNodeIdAtom,
  workflowEditorWorkflowIdAtom,
  updateWorkflowEditorNodeDataAtom,
} from "@/features/workflows/workflow-editor-store";
import { getQueryClient, orpc } from "@/lib/query";
import { swallowIgnorableRouteLoaderError } from "@/lib/query-cancellation";

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Failed to load workflow editor.";
}

function WorkflowEditorPage() {
  const { workflowId } = Route.useParams();
  const queryClient = useQueryClient();

  const authContextQuery = useQuery({
    ...orpc.auth.me.queryOptions({}),
    retry: false,
  });
  const workflowQuery = useQuery({
    ...orpc.workflows.get.queryOptions({ input: { id: workflowId } }),
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

  const canManageByRole = canManageWorkflowsForRole(
    authContextQuery.data?.role,
  );
  const workflowOwnershipAllowsEdit =
    workflowQuery.data && "isOwner" in workflowQuery.data
      ? workflowQuery.data.isOwner !== false
      : true;
  const canManageWorkflow = canManageByRole && workflowOwnershipAllowsEdit;

  useEffect(() => {
    setIsReadOnly(!canManageWorkflow);
  }, [canManageWorkflow, setIsReadOnly]);

  useEffect(() => {
    if (!workflowQuery.data) return;
    setGraph(workflowQuery.data.graph);
    setWorkflowId(workflowQuery.data.id);
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

  const graph = useMemo(
    () => serializeWorkflowGraph({ nodes, edges }),
    [nodes, edges],
  );

  const saveWorkflow = useCallback(async () => {
    if (!isLoaded || !canManageWorkflow) return;
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

  const handleExecute = useCallback((_options?: { dryRun?: boolean }) => {
    toast.error("Workflow execution is not yet implemented.");
  }, []);

  // Keyboard shortcuts for the workflow editor
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: ["meta+s", "ctrl+s"],
        action: () => {
          if (hasUnsavedChanges) void saveWorkflow();
        },
        description: "Save workflow",
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
      {
        key: ["meta+enter", "ctrl+enter"],
        action: () => handleExecute(),
        description: "Run workflow",
        ignoreInputs: false,
      },
    ],
    enabled: canManageWorkflow,
  });

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
    <div className="relative flex h-[calc(100dvh-var(--header-height,3.5rem))] w-full overflow-hidden">
      <WorkflowEditorCanvas canEdit={canManageWorkflow}>
        {/* Back button - top left */}
        <Panel position="top-left" className="flex items-center gap-2">
          <Button
            asChild
            size="icon-sm"
            variant="outline"
            title="Back to workflows"
          >
            <Link to="/workflows">
              <Icon icon={ArrowLeft02Icon} />
            </Link>
          </Button>
        </Panel>

        {/* Toolbar - top right */}
        <WorkflowToolbar
          canManageWorkflow={canManageWorkflow}
          isSaving={isSaving}
          onSave={() => void saveWorkflow()}
          onExecute={handleExecute}
        />
      </WorkflowEditorCanvas>

      {/* Sidebar panel overlay */}
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
          workflowId={workflowQuery.data?.id ?? null}
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
          orpc.workflows.get.queryOptions({
            input: { id: params.workflowId },
          }),
        ),
      ]),
    );
  },
  component: WorkflowEditorPageWrapper,
});
