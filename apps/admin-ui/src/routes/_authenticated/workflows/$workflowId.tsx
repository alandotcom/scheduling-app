import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert02Icon,
  ArrowLeft02Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { ReactFlowProvider } from "@xyflow/react";
import { toast } from "sonner";
import { useAtomValue, useSetAtom } from "jotai";
import type {
  JourneyListResponse,
  JourneyMode,
  JourneyStatus,
} from "@scheduling/dto";
import { linearJourneyGraphSchema } from "@scheduling/dto";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Panel } from "@/components/flow-elements/panel";
import { PageScaffold } from "@/components/layout/page-scaffold";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useIsMobile } from "@/hooks/use-mobile";
import { canManageWorkflowsForRole } from "@/features/workflows/workflow-list-page";
import { WorkflowEditorCanvas } from "@/features/workflows/workflow-editor-canvas";
import { WorkflowEditorSidebar } from "@/features/workflows/workflow-editor-sidebar";
import { WorkflowSidebarPanel } from "@/features/workflows/workflow-sidebar-panel";
import { WorkflowToolbar } from "@/features/workflows/workflow-toolbar";
import {
  clearWorkflowEditorSelectionAtom,
  deleteEdgeAtom,
  deleteNodeAtom,
  redoAtom,
  rightPanelWidthAtom,
  buildPersistableWorkflowGraph,
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
  workflowEditorJourneyModeAtom,
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
  const isMobile = useIsMobile();

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
  const setJourneyMode = useSetAtom(workflowEditorJourneyModeAtom);
  const setRightPanelWidth = useSetAtom(rightPanelWidthAtom);
  const clearSelection = useSetAtom(clearWorkflowEditorSelectionAtom);
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
  const [persistedName, setPersistedName] = useState("");
  const [draftPublishMode, setDraftPublishMode] = useState<JourneyMode>("live");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [dismissedMobileSelectionKey, setDismissedMobileSelectionKey] =
    useState<string | null>(null);
  const [lifecycleDraft, setLifecycleDraft] = useState<{
    status: JourneyStatus;
    mode: JourneyMode;
  } | null>(null);

  const canManageWorkflow = canManageWorkflowsForRole(
    authContextQuery.data?.role,
  );
  const defaultTimezone =
    authContextQuery.data?.org?.defaultTimezone ?? "America/New_York";
  const journeyStatus =
    lifecycleDraft?.status ?? journeyQuery.data?.status ?? "draft";
  const persistedMode =
    lifecycleDraft?.mode ?? journeyQuery.data?.mode ?? "live";
  const effectiveMode =
    journeyStatus === "draft" ? draftPublishMode : persistedMode;
  const mobileSelectionKey = selectedNodeId
    ? `node:${selectedNodeId}`
    : selectedEdgeId
      ? `edge:${selectedEdgeId}`
      : null;

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
    if (isMobile) {
      setRightPanelWidth(null);
    }
  }, [isMobile, setRightPanelWidth]);

  useEffect(() => {
    if (!isMobile) {
      setMobileSidebarOpen(false);
      setDismissedMobileSelectionKey(null);
      return;
    }

    if (!mobileSelectionKey) {
      setMobileSidebarOpen(false);
      setDismissedMobileSelectionKey(null);
      return;
    }

    if (mobileSelectionKey !== dismissedMobileSelectionKey) {
      setMobileSidebarOpen(true);
    }
  }, [dismissedMobileSelectionKey, isMobile, mobileSelectionKey]);

  const handleMobileSidebarOpenChange = useCallback(
    (open: boolean) => {
      setMobileSidebarOpen(open);
      if (!open) {
        setDismissedMobileSelectionKey(mobileSelectionKey);
        clearSelection();
      }
    },
    [clearSelection, mobileSelectionKey],
  );

  useEffect(() => {
    if (!journeyQuery.data) {
      return;
    }

    setGraph(journeyQuery.data.graph);
    setWorkflowId(journeyQuery.data.id);
    setNameDraft(journeyQuery.data.name);
    setPersistedName(journeyQuery.data.name);
    setLifecycleDraft({
      status: journeyQuery.data.status,
      mode: journeyQuery.data.mode,
    });

    if (journeyQuery.data.status === "draft") {
      setDraftPublishMode(journeyQuery.data.mode);
    }
  }, [journeyQuery.data, setGraph, setWorkflowId]);

  useEffect(() => {
    setJourneyMode(effectiveMode);
  }, [effectiveMode, setJourneyMode]);

  const updateMutation = useMutation(
    orpc.journeys.update.mutationOptions({
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
        queryClient.invalidateQueries({ queryKey: orpc.journeys.key() });
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

  const persistableGraphResult = useMemo(
    () => buildPersistableWorkflowGraph({ nodes, edges }),
    [nodes, edges],
  );

  const saveJourney = useCallback(async () => {
    if (!isLoaded || !canManageWorkflow) {
      return;
    }

    const currentStatus =
      lifecycleDraft?.status ?? journeyQuery.data?.status ?? "draft";

    setIsSaving(true);
    try {
      const parsedPersistableGraph = linearJourneyGraphSchema.safeParse(
        persistableGraphResult.graph,
      );
      if (!parsedPersistableGraph.success) {
        toast.error("Failed to save journey draft");
        return;
      }

      const updated = await updateMutation.mutateAsync({
        id: workflowId,
        data:
          currentStatus === "draft"
            ? {
                graph: parsedPersistableGraph.data,
                mode: draftPublishMode,
              }
            : { graph: parsedPersistableGraph.data },
      });
      patchJourneyInListCache(updated.id, {
        status: updated.status,
        mode: updated.mode,
        updatedAt: updated.updatedAt,
      });
      setLifecycleDraft({
        status: updated.status,
        mode: updated.mode,
      });
      if (updated.status === "draft") {
        setDraftPublishMode(updated.mode);
      }
      setHasUnsavedChanges(persistableGraphResult.skippedNodeIds.length > 0);
    } finally {
      setIsSaving(false);
    }
  }, [
    canManageWorkflow,
    draftPublishMode,
    isLoaded,
    journeyQuery.data?.status,
    lifecycleDraft,
    patchJourneyInListCache,
    persistableGraphResult,
    setDraftPublishMode,
    setHasUnsavedChanges,
    setIsSaving,
    setLifecycleDraft,
    updateMutation,
    workflowId,
  ]);

  const commitJourneyName = useCallback(async () => {
    if (!canManageWorkflow || !journeyQuery.data) {
      return;
    }

    const trimmedName = nameDraft.trim();
    if (trimmedName.length === 0) {
      setNameDraft(persistedName);
      toast.error("Journey name is required");
      return;
    }

    if (trimmedName === persistedName) {
      return;
    }

    const updated = await renameMutation.mutateAsync({
      id: workflowId,
      data: { name: trimmedName },
    });

    setNameDraft(updated.name);
    setPersistedName(updated.name);
  }, [
    canManageWorkflow,
    journeyQuery.data,
    nameDraft,
    persistedName,
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

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">
        {effectiveMode === "test" ? (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <p className="flex items-center gap-1.5 font-semibold tracking-wide text-destructive">
                <Icon className="size-3.5" icon={Alert02Icon} />
                TEST MODE ACTIVE
              </p>
              <p className="font-medium text-foreground">
                No real email or SMS will be sent from this workflow.
              </p>
              <p className="text-muted-foreground">
                Delivery is sandboxed to log-only behavior or integration test
                recipients only.
              </p>
            </div>
          </div>
        ) : null}
        <div className="relative min-h-0 flex-1">
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
                    setNameDraft(persistedName);
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
        </div>
      </div>

      {isMobile ? (
        <Sheet
          onOpenChange={handleMobileSidebarOpenChange}
          open={mobileSidebarOpen && !!mobileSelectionKey}
        >
          <SheetContent
            side="bottom"
            className="data-[side=bottom]:h-[100dvh] data-[side=bottom]:rounded-none gap-0 border-t border-border p-0"
          >
            <SheetHeader className="flex-row items-center justify-between border-b border-border px-4 py-3">
              <SheetTitle className="text-base">Inspector</SheetTitle>
              <SheetClose asChild>
                <Button size="icon-sm" type="button" variant="ghost">
                  <Icon icon={Cancel01Icon} />
                  <span className="sr-only">Close inspector</span>
                </Button>
              </SheetClose>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-hidden">
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
            </div>
          </SheetContent>
        </Sheet>
      ) : (
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
      )}
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
