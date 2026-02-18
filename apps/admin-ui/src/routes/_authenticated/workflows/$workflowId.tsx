import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { ReactFlowProvider } from "@xyflow/react";
import { toast } from "sonner";
import { useAtomValue, useSetAtom } from "jotai";
import type {
  JourneyListResponse,
  JourneyMode,
  JourneyStatus,
} from "@scheduling/dto";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
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
  const [nameDraft, setNameDraft] = useState("");
  const [draftPublishMode, setDraftPublishMode] = useState<JourneyMode>("live");
  const [lifecycleDraft, setLifecycleDraft] = useState<{
    status: JourneyStatus;
    mode: JourneyMode;
  } | null>(null);

  const canManageWorkflow = canManageWorkflowsForRole(
    authContextQuery.data?.role,
  );
  const defaultTimezone =
    authContextQuery.data?.org?.defaultTimezone ?? "America/New_York";

  const patchJourneyInListCache = useCallback(
    (journeyId: string, patch: Partial<JourneyListResponse[number]>) => {
      queryClient.setQueryData<JourneyListResponse | undefined>(
        orpc.journeys.list.key(),
        (current) => {
          if (!current) {
            return current;
          }

          return current.map((journey) => {
            if (journey.id !== journeyId) {
              return journey;
            }

            return {
              ...journey,
              ...patch,
            };
          });
        },
      );
    },
    [queryClient],
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
    setNameDraft(journeyQuery.data.name);
    setLifecycleDraft({
      status: journeyQuery.data.status,
      mode: journeyQuery.data.mode,
    });

    if (journeyQuery.data.status === "draft") {
      setDraftPublishMode(journeyQuery.data.mode);
    }
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

  const renameMutation = useMutation(
    orpc.journeys.update.mutationOptions({
      onSuccess: (journey) => {
        patchJourneyInListCache(journey.id, {
          name: journey.name,
          updatedAt: journey.updatedAt,
        });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to rename journey");
      },
    }),
  );

  const publishMutation = useMutation(
    orpc.journeys.publish.mutationOptions({
      onSuccess: (result) => {
        setPublishWarnings(result.warnings);
        setLifecycleDraft({
          status: result.journey.status,
          mode: result.journey.mode,
        });
        patchJourneyInListCache(result.journey.id, {
          status: result.journey.status,
          mode: result.journey.mode,
          updatedAt: result.journey.updatedAt,
        });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to publish journey");
        if (journeyQuery.data) {
          setLifecycleDraft({
            status: journeyQuery.data.status,
            mode: journeyQuery.data.mode,
          });
        }
      },
    }),
  );

  const pauseMutation = useMutation(
    orpc.journeys.pause.mutationOptions({
      onSuccess: (journey) => {
        setPublishWarnings([]);
        setLifecycleDraft({
          status: journey.status,
          mode: journey.mode,
        });
        patchJourneyInListCache(journey.id, {
          status: journey.status,
          mode: journey.mode,
          updatedAt: journey.updatedAt,
        });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to pause journey");
        if (journeyQuery.data) {
          setLifecycleDraft({
            status: journeyQuery.data.status,
            mode: journeyQuery.data.mode,
          });
        }
      },
    }),
  );

  const resumeMutation = useMutation(
    orpc.journeys.resume.mutationOptions({
      onSuccess: (journey) => {
        setPublishWarnings([]);
        setLifecycleDraft({
          status: journey.status,
          mode: journey.mode,
        });
        patchJourneyInListCache(journey.id, {
          status: journey.status,
          mode: journey.mode,
          updatedAt: journey.updatedAt,
        });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to resume journey");
        if (journeyQuery.data) {
          setLifecycleDraft({
            status: journeyQuery.data.status,
            mode: journeyQuery.data.mode,
          });
        }
      },
    }),
  );

  const setModeMutation = useMutation(
    orpc.journeys.setMode.mutationOptions({
      onSuccess: (journey) => {
        setLifecycleDraft({
          status: journey.status,
          mode: journey.mode,
        });
        patchJourneyInListCache(journey.id, {
          status: journey.status,
          mode: journey.mode,
          updatedAt: journey.updatedAt,
        });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update journey mode");
        if (journeyQuery.data) {
          setLifecycleDraft({
            status: journeyQuery.data.status,
            mode: journeyQuery.data.mode,
          });
        }
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
      const updated = await updateMutation.mutateAsync({
        id: workflowId,
        data: { graph },
      });
      patchJourneyInListCache(updated.id, {
        updatedAt: updated.updatedAt,
      });
      setHasUnsavedChanges(false);
    } finally {
      setIsSaving(false);
    }
  }, [
    canManageWorkflow,
    graph,
    isLoaded,
    patchJourneyInListCache,
    setHasUnsavedChanges,
    setIsSaving,
    updateMutation,
    workflowId,
  ]);

  const commitJourneyName = useCallback(async () => {
    if (!canManageWorkflow || !journeyQuery.data) {
      return;
    }

    const trimmedName = nameDraft.trim();
    if (trimmedName.length === 0) {
      setNameDraft(journeyQuery.data.name);
      toast.error("Journey name is required");
      return;
    }

    if (trimmedName === journeyQuery.data.name) {
      return;
    }

    const updated = await renameMutation.mutateAsync({
      id: workflowId,
      data: { name: trimmedName },
    });

    setNameDraft(updated.name);
    queryClient.invalidateQueries({ queryKey: orpc.journeys.get.key() });
  }, [
    canManageWorkflow,
    journeyQuery.data,
    nameDraft,
    queryClient,
    renameMutation,
    workflowId,
  ]);

  const handlePublish = useCallback(
    async (mode: JourneyMode) => {
      if (!canManageWorkflow) {
        return;
      }

      if (hasUnsavedChanges) {
        await saveJourney();
      }

      setLifecycleDraft({
        status: "published",
        mode,
      });

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

    setLifecycleDraft((current) =>
      current
        ? {
            ...current,
            status: "paused",
          }
        : current,
    );

    await pauseMutation.mutateAsync({ id: workflowId });
  }, [canManageWorkflow, pauseMutation, workflowId]);

  const handleResume = useCallback(async () => {
    if (!canManageWorkflow) {
      return;
    }

    setLifecycleDraft((current) =>
      current
        ? {
            ...current,
            status: "published",
          }
        : current,
    );

    await resumeMutation.mutateAsync({ id: workflowId });
  }, [canManageWorkflow, resumeMutation, workflowId]);

  const handleSetMode = useCallback(
    async (mode: JourneyMode) => {
      if (!canManageWorkflow) {
        return;
      }

      const currentStatus = lifecycleDraft?.status ?? journeyQuery.data?.status;
      if (currentStatus === "draft") {
        setDraftPublishMode(mode);
        return;
      }

      if (currentStatus !== "published") {
        return;
      }

      const currentMode = lifecycleDraft?.mode ?? journeyQuery.data?.mode;
      if (currentMode === mode) {
        return;
      }

      setLifecycleDraft((current) =>
        current
          ? {
              ...current,
              mode,
            }
          : current,
      );

      await setModeMutation.mutateAsync({
        id: workflowId,
        data: { mode },
      });
    },
    [
      canManageWorkflow,
      journeyQuery.data?.mode,
      journeyQuery.data?.status,
      lifecycleDraft,
      setModeMutation,
      workflowId,
    ],
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
          <Link to="/workflows" search={{ q: undefined }}>
            Back to journeys
          </Link>
        </Button>
      </PageScaffold>
    );
  }

  const journeyStatus =
    lifecycleDraft?.status ?? journeyQuery.data?.status ?? "draft";
  const persistedMode =
    lifecycleDraft?.mode ?? journeyQuery.data?.mode ?? "live";
  const effectiveMode =
    journeyStatus === "draft" ? draftPublishMode : persistedMode;

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
            <Link to="/workflows" search={{ q: undefined }}>
              <Icon icon={ArrowLeft02Icon} />
            </Link>
          </Button>
          <Input
            className="h-8 w-64"
            disabled={!canManageWorkflow || renameMutation.isPending}
            onBlur={() => void commitJourneyName()}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
              if (event.key === "Escape" && journeyQuery.data) {
                event.preventDefault();
                setNameDraft(journeyQuery.data.name);
                event.currentTarget.blur();
              }
            }}
            value={nameDraft}
          />
        </Panel>

        <WorkflowToolbar
          canManageWorkflow={canManageWorkflow}
          journeyStatus={journeyStatus}
          journeyMode={effectiveMode}
          publishWarnings={publishWarnings}
          isPausing={pauseMutation.isPending}
          isPublishing={publishMutation.isPending}
          isResuming={resumeMutation.isPending}
          isSaving={isSaving}
          isSettingMode={setModeMutation.isPending}
          onPause={() => void handlePause()}
          onPublish={(mode) => void handlePublish(mode)}
          onResume={() => void handleResume()}
          onSave={() => void saveJourney()}
          onSetMode={(mode) => void handleSetMode(mode)}
        />
      </WorkflowEditorCanvas>

      <WorkflowSidebarPanel>
        <WorkflowEditorSidebar
          canManageWorkflow={canManageWorkflow}
          defaultTimezone={defaultTimezone}
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
