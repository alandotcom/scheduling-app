import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { ReactFlowProvider } from "@xyflow/react";
import { toast } from "sonner";
import { useAtomValue, useSetAtom } from "jotai";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/flow-elements/panel";
import { PageScaffold } from "@/components/layout/page-scaffold";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  selectedExecutionIdAtom,
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
  const [isExecuteModalOpen, setIsExecuteModalOpen] = useState(false);
  const [executeDryRun, setExecuteDryRun] = useState(false);
  const [selectedEventType, setSelectedEventType] = useState<string | null>(
    null,
  );
  const [selectedSampleRecordId, setSelectedSampleRecordId] = useState<
    string | null
  >(null);

  const authContextQuery = useQuery({
    ...orpc.auth.me.queryOptions({}),
    retry: false,
  });
  const workflowQuery = useQuery({
    ...orpc.workflows.get.queryOptions({ input: { id: workflowId } }),
    retry: false,
  });
  const executionSamplesQuery = useQuery({
    ...orpc.workflows.listExecutionSamples.queryOptions({
      input: { id: workflowId },
    }),
    enabled: isExecuteModalOpen,
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
  const setSelectedExecutionId = useSetAtom(selectedExecutionIdAtom);
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
  const toggleEnabledMutation = useMutation(
    orpc.workflows.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.workflows.key() });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update workflow state");
      },
    }),
  );
  const executeMutation = useMutation(
    orpc.workflows.execute.mutationOptions({
      onSuccess: async (result, variables) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.workflows.executions.list.key(),
        });

        if ("executionId" in result && typeof result.executionId === "string") {
          setSelectedExecutionId(result.executionId);
        }

        setIsExecuteModalOpen(false);

        if (result.status === "running") {
          toast.message(
            variables.data.dryRun ? "Dry run started" : "Workflow run started",
          );
          return;
        }

        if (result.status === "cancelled") {
          toast.message("Workflow run cancelled");
          return;
        }

        toast.message(`Workflow run ignored: ${result.reason}`);
      },
      onError: (error) => {
        toast.error(error.message || "Failed to execute workflow");
      },
    }),
  );

  const graph = useMemo(
    () => serializeWorkflowGraph({ nodes, edges }),
    [nodes, edges],
  );
  const availableSamples = executionSamplesQuery.data?.samples ?? [];
  const availableEventTypes = useMemo(
    () =>
      Array.from(new Set(availableSamples.map((sample) => sample.eventType))),
    [availableSamples],
  );
  const samplesForSelectedEventType = useMemo(
    () =>
      selectedEventType
        ? availableSamples.filter(
            (sample) => sample.eventType === selectedEventType,
          )
        : [],
    [availableSamples, selectedEventType],
  );
  const selectedSample = useMemo(
    () =>
      samplesForSelectedEventType.find(
        (sample) => sample.recordId === selectedSampleRecordId,
      ) ?? null,
    [samplesForSelectedEventType, selectedSampleRecordId],
  );

  useEffect(() => {
    if (!isExecuteModalOpen) return;

    if (availableEventTypes.length === 0) {
      setSelectedEventType(null);
      return;
    }

    if (
      !selectedEventType ||
      !availableEventTypes.some((eventType) => eventType === selectedEventType)
    ) {
      setSelectedEventType(availableEventTypes[0]!);
    }
  }, [availableEventTypes, isExecuteModalOpen, selectedEventType]);

  useEffect(() => {
    if (!selectedEventType) {
      setSelectedSampleRecordId(null);
      return;
    }

    if (
      !selectedSampleRecordId ||
      !samplesForSelectedEventType.some(
        (sample) => sample.recordId === selectedSampleRecordId,
      )
    ) {
      setSelectedSampleRecordId(
        samplesForSelectedEventType[0]?.recordId ?? null,
      );
    }
  }, [selectedEventType, selectedSampleRecordId, samplesForSelectedEventType]);

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
    setSelectedExecutionId,
    updateMutation,
    workflowId,
  ]);

  const handleExecute = useCallback(
    (options?: { dryRun?: boolean }) => {
      if (!canManageWorkflow) return;
      if (!workflowQuery.data?.isEnabled) {
        toast.error("Turn workflow on before running.");
        return;
      }
      setExecuteDryRun(options?.dryRun ?? false);
      setIsExecuteModalOpen(true);
    },
    [canManageWorkflow, workflowQuery.data?.isEnabled],
  );

  const handleToggleEnabled = useCallback(async () => {
    if (!canManageWorkflow || !workflowQuery.data) return;

    await toggleEnabledMutation.mutateAsync({
      id: workflowId,
      data: { isEnabled: !workflowQuery.data.isEnabled },
    });
  }, [
    canManageWorkflow,
    toggleEnabledMutation,
    workflowId,
    workflowQuery.data,
  ]);

  const handleExecuteConfirm = useCallback(async () => {
    if (!selectedSample) {
      return;
    }

    await executeMutation.mutateAsync({
      id: workflowId,
      data: {
        eventType: selectedSample.eventType,
        payload: selectedSample.payload,
        dryRun: executeDryRun,
      },
    });
  }, [executeDryRun, executeMutation, selectedSample, workflowId]);

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
    <div className="relative flex h-full min-h-0 w-full overflow-hidden">
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
          isEnabled={workflowQuery.data?.isEnabled ?? false}
          isSaving={isSaving}
          isTogglingEnabled={toggleEnabledMutation.isPending}
          onSave={() => void saveWorkflow()}
          onToggleEnabled={() => void handleToggleEnabled()}
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

      <AlertDialog
        open={isExecuteModalOpen}
        onOpenChange={(open) => {
          setIsExecuteModalOpen(open);
          if (!open) {
            setSelectedEventType(null);
            setSelectedSampleRecordId(null);
          }
        }}
      >
        <AlertDialogContent size="lg" className="min-h-[75dvh]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {executeDryRun ? "Dry run workflow" : "Run workflow"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Select a real event record generated from your current trigger
              configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {executionSamplesQuery.isLoading ? (
            <p className="text-muted-foreground text-sm">
              Loading sample events...
            </p>
          ) : null}

          {!executionSamplesQuery.isLoading && availableSamples.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No sample records are available for the configured trigger yet.
            </p>
          ) : null}

          {availableSamples.length > 0 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workflow-execute-event-type">Event type</Label>
                <Select
                  value={selectedEventType ?? ""}
                  onValueChange={(value) => setSelectedEventType(value)}
                >
                  <SelectTrigger id="workflow-execute-event-type" size="sm">
                    <SelectValue placeholder="Select event type" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEventTypes.map((eventType) => (
                      <SelectItem key={eventType} value={eventType}>
                        {eventType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="workflow-execute-record">Record</Label>
                <Select
                  value={selectedSampleRecordId ?? ""}
                  onValueChange={(value) => setSelectedSampleRecordId(value)}
                >
                  <SelectTrigger id="workflow-execute-record" size="sm">
                    <SelectValue placeholder="Select record">
                      {selectedSample?.label ?? "Select record"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {samplesForSelectedEventType.map((sample) => (
                      <SelectItem key={sample.recordId} value={sample.recordId}>
                        {sample.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSample ? (
                <div className="space-y-2">
                  <Label>Sample payload preview</Label>
                  <pre className="max-h-52 overflow-auto rounded-md border bg-muted/40 p-2 text-[11px] whitespace-pre-wrap">
                    {JSON.stringify(selectedSample.payload, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                executeMutation.isPending ||
                executionSamplesQuery.isLoading ||
                !selectedSample
              }
              onClick={() => void handleExecuteConfirm()}
            >
              {executeMutation.isPending
                ? executeDryRun
                  ? "Dry running..."
                  : "Running..."
                : executeDryRun
                  ? "Dry run"
                  : "Run"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
