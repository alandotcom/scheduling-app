import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert02Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { ReactFlowProvider } from "@xyflow/react";
import { toast } from "sonner";
import { useAtomValue, useSetAtom } from "jotai";
import type {
  JourneyListResponse,
  JourneyMode,
  JourneyStatus,
} from "@scheduling/dto";
import { linearJourneyGraphSchema } from "@scheduling/dto";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageScaffold } from "@/components/layout/page-scaffold";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useBufferedPending } from "@/hooks/use-buffered-pending";
import { useIsMobile } from "@/hooks/use-mobile";
import { canManageWorkflowsForRole } from "@/features/workflows/workflow-list-page";
import { WorkflowEditorCanvas } from "@/features/workflows/workflow-editor-canvas";
import { WorkflowEditorSidebar } from "@/features/workflows/workflow-editor-sidebar";
import { WorkflowSidebarPanel } from "@/features/workflows/workflow-sidebar-panel";
import { WorkflowToolbar } from "@/features/workflows/workflow-toolbar";
import {
  deleteEdgeAtom,
  deleteNodeAtom,
  isExecutionViewActiveAtom,
  redoAtom,
  rightPanelWidthAtom,
  buildPersistableWorkflowGraph,
  setWorkflowEditorActionTypeAtom,
  setWorkflowEditorGraphAtom,
  undoAtom,
  updateWorkflowEditorNodeDataAtom,
  workflowActiveCanvasEdgesAtom,
  workflowActiveCanvasNodesAtom,
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

type WorkflowSidebarTabValue = "properties" | "runs";

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Failed to load journey editor.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorkflowSidebarTabValue(
  value: string,
): value is WorkflowSidebarTabValue {
  return value === "properties" || value === "runs";
}

function isTriggerOnlyDraftGraph(input: {
  nodes: Array<{ data?: unknown }>;
  edges: unknown[];
}): boolean {
  if (input.nodes.length !== 1 || input.edges.length !== 0) {
    return false;
  }

  const triggerNode = input.nodes[0];
  if (!triggerNode || !isRecord(triggerNode.data)) {
    return false;
  }

  return triggerNode.data.type === "trigger";
}

function WorkflowEditorPage() {
  const { workflowId } = Route.useParams();
  const { sidebarTab, runId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
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
  const activeCanvasNodes = useAtomValue(workflowActiveCanvasNodesAtom);
  const activeCanvasEdges = useAtomValue(workflowActiveCanvasEdgesAtom);
  const rightPanelWidth = useAtomValue(rightPanelWidthAtom);
  const isExecutionViewActive = useAtomValue(isExecutionViewActiveAtom);
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
  const updateNodeData = useSetAtom(updateWorkflowEditorNodeDataAtom);
  const setActionType = useSetAtom(setWorkflowEditorActionTypeAtom);
  const deleteNode = useSetAtom(deleteNodeAtom);
  const deleteEdge = useSetAtom(deleteEdgeAtom);
  const undo = useSetAtom(undoAtom);
  const redo = useSetAtom(redoAtom);

  const selectedNode = useMemo(
    () => activeCanvasNodes.find((node) => node.id === selectedNodeId) ?? null,
    [activeCanvasNodes, selectedNodeId],
  );

  const selectedEdge = useMemo(
    () => activeCanvasEdges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [activeCanvasEdges, selectedEdgeId],
  );

  const [publishWarnings, setPublishWarnings] = useState<string[]>([]);
  const [persistedName, setPersistedName] = useState("");
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameInputValue, setRenameInputValue] = useState("");
  const [renameValidationError, setRenameValidationError] = useState<
    string | null
  >(null);
  const [currentVersionDraft, setCurrentVersionDraft] = useState<number | null>(
    null,
  );
  const [draftPublishMode, setDraftPublishMode] = useState<JourneyMode>("live");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [dismissedMobileSelectionKey, setDismissedMobileSelectionKey] =
    useState<string | null>(null);
  const [lifecycleDraft, setLifecycleDraft] = useState<{
    status: JourneyStatus;
    mode: JourneyMode;
  } | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const canManageWorkflow = canManageWorkflowsForRole(
    authContextQuery.data?.role,
  );
  const canManageCurrentView = canManageWorkflow && !isExecutionViewActive;
  const defaultTimezone =
    authContextQuery.data?.org?.defaultTimezone ?? "America/New_York";
  const journeyStatus =
    lifecycleDraft?.status ?? journeyQuery.data?.status ?? "draft";
  const persistedMode =
    lifecycleDraft?.mode ?? journeyQuery.data?.mode ?? "live";
  const effectiveMode =
    journeyStatus === "draft" ? draftPublishMode : persistedMode;
  const currentVersion =
    currentVersionDraft ?? journeyQuery.data?.currentVersion;
  const isTriggerTypeLocked =
    nodes.length > 0 && !isTriggerOnlyDraftGraph({ nodes, edges });
  const mobileSelectionKey = selectedNodeId
    ? `node:${selectedNodeId}`
    : selectedEdgeId
      ? `edge:${selectedEdgeId}`
      : null;
  const activeSidebarTab: WorkflowSidebarTabValue =
    runId && !sidebarTab ? "runs" : (sidebarTab ?? "properties");

  const setSidebarTab = useCallback(
    (nextTab: WorkflowSidebarTabValue) => {
      navigate({
        search: (prev) => ({
          ...prev,
          sidebarTab: nextTab,
          runId: nextTab === "runs" ? prev.runId : undefined,
        }),
      });
    },
    [navigate],
  );

  const setSelectedRunId = useCallback(
    (nextRunId: string | null) => {
      navigate({
        replace: nextRunId === null,
        search: (prev) => ({
          ...prev,
          sidebarTab: "runs",
          runId: nextRunId ?? undefined,
        }),
      });
    },
    [navigate],
  );

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

  const patchJourneyInDetailCache = useCallback(
    (journeyId: string, patch: Partial<JourneyListResponse[number]>) => {
      queryClient.setQueryData(
        orpc.journeys.get.queryOptions({ input: { id: journeyId } }).queryKey,
        (current) => {
          if (!isRecord(current)) {
            return current;
          }
          return {
            ...current,
            ...patch,
          };
        },
      );
    },
    [queryClient],
  );

  useEffect(() => {
    setIsReadOnly(!canManageCurrentView);
  }, [canManageCurrentView, setIsReadOnly]);

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
      }
    },
    [mobileSelectionKey],
  );

  useEffect(() => {
    if (!journeyQuery.data || isExecutionViewActive) {
      return;
    }

    setGraph(journeyQuery.data.graph);
    setWorkflowId(journeyQuery.data.id);
    setPersistedName(journeyQuery.data.name);
    setCurrentVersionDraft(journeyQuery.data.currentVersion);
    setLifecycleDraft({
      status: journeyQuery.data.status,
      mode: journeyQuery.data.mode,
    });

    if (journeyQuery.data.status === "draft") {
      setDraftPublishMode(journeyQuery.data.mode);
    }
  }, [isExecutionViewActive, journeyQuery.data, setGraph, setWorkflowId]);

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
          currentVersion: journey.currentVersion,
          updatedAt: journey.updatedAt,
        });
        patchJourneyInDetailCache(journey.id, {
          name: journey.name,
          currentVersion: journey.currentVersion,
          updatedAt: journey.updatedAt,
        });
        setCurrentVersionDraft(journey.currentVersion);
        queryClient.invalidateQueries({ queryKey: orpc.journeys.key() });
      },
      onError: (error) => {
        toast.error(error.message || "Failed to rename journey");
      },
    }),
  );
  const showRenamePendingVisual = useBufferedPending(renameMutation.isPending);

  const publishMutation = useMutation(
    orpc.journeys.publish.mutationOptions({
      onSuccess: (result) => {
        setPublishWarnings(result.warnings);
        setLifecycleDraft({
          status: result.journey.status,
          mode: result.journey.mode,
        });
        setCurrentVersionDraft(result.journey.currentVersion);
        patchJourneyInListCache(result.journey.id, {
          status: result.journey.status,
          mode: result.journey.mode,
          currentVersion: result.journey.currentVersion,
          updatedAt: result.journey.updatedAt,
        });
        patchJourneyInDetailCache(result.journey.id, {
          status: result.journey.status,
          mode: result.journey.mode,
          currentVersion: result.journey.currentVersion,
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
          setCurrentVersionDraft(journeyQuery.data.currentVersion);
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
        setCurrentVersionDraft(journey.currentVersion);
        patchJourneyInListCache(journey.id, {
          status: journey.status,
          mode: journey.mode,
          currentVersion: journey.currentVersion,
          updatedAt: journey.updatedAt,
        });
        patchJourneyInDetailCache(journey.id, {
          status: journey.status,
          mode: journey.mode,
          currentVersion: journey.currentVersion,
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
          setCurrentVersionDraft(journeyQuery.data.currentVersion);
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
        setCurrentVersionDraft(journey.currentVersion);
        patchJourneyInListCache(journey.id, {
          status: journey.status,
          mode: journey.mode,
          currentVersion: journey.currentVersion,
          updatedAt: journey.updatedAt,
        });
        patchJourneyInDetailCache(journey.id, {
          status: journey.status,
          mode: journey.mode,
          currentVersion: journey.currentVersion,
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
          setCurrentVersionDraft(journeyQuery.data.currentVersion);
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
        setCurrentVersionDraft(journey.currentVersion);
        patchJourneyInListCache(journey.id, {
          status: journey.status,
          mode: journey.mode,
          currentVersion: journey.currentVersion,
          updatedAt: journey.updatedAt,
        });
        patchJourneyInDetailCache(journey.id, {
          status: journey.status,
          mode: journey.mode,
          currentVersion: journey.currentVersion,
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
          setCurrentVersionDraft(journeyQuery.data.currentVersion);
        }
      },
    }),
  );

  const persistableGraphResult = useMemo(
    () => buildPersistableWorkflowGraph({ nodes, edges }),
    [nodes, edges],
  );

  const saveJourney = useCallback(async (): Promise<boolean> => {
    if (!isLoaded || !canManageCurrentView) {
      return false;
    }

    const currentStatus =
      lifecycleDraft?.status ?? journeyQuery.data?.status ?? "draft";

    setIsSaving(true);
    try {
      if (persistableGraphResult.skippedNodeIds.length > 0) {
        toast.error(
          "Cannot save journey with disconnected or incomplete steps. Reconnect or delete them first.",
        );
        return false;
      }

      const parsedPersistableGraph = linearJourneyGraphSchema.safeParse(
        persistableGraphResult.graph,
      );
      if (!parsedPersistableGraph.success) {
        toast.error("Failed to save journey draft");
        return false;
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
        name: updated.name,
        status: updated.status,
        mode: updated.mode,
        currentVersion: updated.currentVersion,
        graph: updated.graph,
        updatedAt: updated.updatedAt,
      });
      patchJourneyInDetailCache(updated.id, {
        name: updated.name,
        status: updated.status,
        mode: updated.mode,
        currentVersion: updated.currentVersion,
        graph: updated.graph,
        updatedAt: updated.updatedAt,
      });
      setCurrentVersionDraft(updated.currentVersion);
      setLifecycleDraft({
        status: updated.status,
        mode: updated.mode,
      });
      if (updated.status === "draft") {
        setDraftPublishMode(updated.mode);
      }
      setHasUnsavedChanges(false);
      return true;
    } finally {
      setIsSaving(false);
    }
  }, [
    canManageCurrentView,
    draftPublishMode,
    isLoaded,
    journeyQuery.data?.status,
    lifecycleDraft,
    patchJourneyInListCache,
    patchJourneyInDetailCache,
    persistableGraphResult,
    setDraftPublishMode,
    setHasUnsavedChanges,
    setIsSaving,
    setLifecycleDraft,
    updateMutation,
    workflowId,
  ]);

  const submitJourneyName = useCallback(
    async (rawName: string) => {
      if (!canManageCurrentView || !journeyQuery.data) {
        return;
      }

      const trimmedName = rawName.trim();
      if (trimmedName.length === 0) {
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

      setPersistedName(updated.name);
    },
    [
      canManageCurrentView,
      journeyQuery.data,
      persistedName,
      renameMutation,
      workflowId,
    ],
  );

  useEffect(() => {
    if (!isRenameDialogOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      renameInputRef.current?.focus();
    }, 50);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isRenameDialogOpen]);

  const handleRenameDialogOpenChange = useCallback(
    (open: boolean) => {
      setIsRenameDialogOpen(open);
      if (!open) {
        setRenameValidationError(null);
        return;
      }

      setRenameInputValue(persistedName);
      setRenameValidationError(null);
    },
    [persistedName],
  );

  const handleRenameSubmit = useCallback(async () => {
    if (!canManageCurrentView || !journeyQuery.data) {
      return;
    }

    const trimmedName = renameInputValue.trim();
    if (trimmedName.length === 0) {
      setRenameValidationError("Journey name is required");
      return;
    }

    if (trimmedName === persistedName) {
      setIsRenameDialogOpen(false);
      return;
    }

    setRenameValidationError(null);

    try {
      await submitJourneyName(trimmedName);
      setIsRenameDialogOpen(false);
    } catch {
      // Toast is handled by mutation onError.
    }
  }, [
    canManageCurrentView,
    journeyQuery.data,
    persistedName,
    renameInputValue,
    submitJourneyName,
  ]);

  const handleRenameFromToolbar = useCallback(() => {
    if (!canManageCurrentView || !journeyQuery.data) {
      return;
    }
    setRenameInputValue(persistedName);
    setRenameValidationError(null);
    setIsRenameDialogOpen(true);
  }, [canManageCurrentView, journeyQuery.data, persistedName]);

  const handlePublish = useCallback(
    async (mode: JourneyMode) => {
      if (!canManageCurrentView) {
        return;
      }

      if (hasUnsavedChanges) {
        const didSave = await saveJourney();
        if (!didSave) {
          return;
        }
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
      canManageCurrentView,
      hasUnsavedChanges,
      publishMutation,
      saveJourney,
      workflowId,
    ],
  );

  const handlePause = useCallback(async () => {
    if (!canManageCurrentView) {
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
  }, [canManageCurrentView, pauseMutation, workflowId]);

  const handleResume = useCallback(async () => {
    if (!canManageCurrentView) {
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
  }, [canManageCurrentView, resumeMutation, workflowId]);

  const handleSetMode = useCallback(
    async (mode: JourneyMode) => {
      if (!canManageCurrentView) {
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
      canManageCurrentView,
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
    enabled: canManageCurrentView,
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
        <Link
          to="/workflows"
          search={{ q: undefined }}
          className={buttonVariants({ size: "sm", variant: "outline" })}
        >
          Back to journeys
        </Link>
      </PageScaffold>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1">
          <WorkflowEditorCanvas canEdit={canManageCurrentView}>
            <WorkflowToolbar
              canManageWorkflow={canManageCurrentView}
              journeyStatus={journeyStatus}
              journeyMode={effectiveMode}
              currentVersion={currentVersion ?? null}
              publishWarnings={publishWarnings}
              isPausing={pauseMutation.isPending}
              isPublishing={publishMutation.isPending}
              isRenaming={renameMutation.isPending}
              isResuming={resumeMutation.isPending}
              isSaving={isSaving}
              isSettingMode={setModeMutation.isPending}
              onPause={() => void handlePause()}
              onPublish={(mode) => void handlePublish(mode)}
              onRename={handleRenameFromToolbar}
              onResume={() => void handleResume()}
              onSave={() => void saveJourney()}
              onSetMode={(mode) => void handleSetMode(mode)}
            />
          </WorkflowEditorCanvas>
        </div>
        {effectiveMode === "test" ? (
          <div
            className="shrink-0 border-t border-destructive/30 bg-destructive/10 px-4 py-2 transition-[width] duration-200"
            style={{
              width:
                !isMobile && rightPanelWidth
                  ? `calc(100% - ${rightPanelWidth})`
                  : "100%",
            }}
          >
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
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
      </div>

      {isMobile ? (
        <Sheet
          onOpenChange={handleMobileSidebarOpenChange}
          open={mobileSidebarOpen && !!mobileSelectionKey}
        >
          <SheetContent
            side="bottom"
            showCloseButton={false}
            className="data-[side=bottom]:h-[100dvh] data-[side=bottom]:rounded-none gap-0 border-t border-border p-0"
          >
            <SheetHeader className="flex-row items-center justify-between border-b border-border px-4 py-3">
              <SheetTitle className="text-base">Inspector</SheetTitle>
              <SheetClose
                render={<Button size="icon-sm" type="button" variant="ghost" />}
              >
                <Icon icon={Cancel01Icon} />
                <span className="sr-only">Close inspector</span>
              </SheetClose>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-hidden">
              <WorkflowEditorSidebar
                activeTab={activeSidebarTab}
                canManageWorkflow={canManageCurrentView}
                defaultTimezone={defaultTimezone}
                edges={activeCanvasEdges}
                nodes={activeCanvasNodes}
                onActiveTabChange={setSidebarTab}
                onDeleteEdge={canManageCurrentView ? deleteEdge : undefined}
                onDeleteNode={canManageCurrentView ? deleteNode : undefined}
                onSelectedRunIdChange={setSelectedRunId}
                onSetActionType={setActionType}
                onUpdateNodeData={updateNodeData}
                isTriggerTypeLocked={isTriggerTypeLocked}
                selectedRunId={runId ?? null}
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
            activeTab={activeSidebarTab}
            canManageWorkflow={canManageCurrentView}
            defaultTimezone={defaultTimezone}
            edges={activeCanvasEdges}
            nodes={activeCanvasNodes}
            onActiveTabChange={setSidebarTab}
            onDeleteEdge={canManageCurrentView ? deleteEdge : undefined}
            onDeleteNode={canManageCurrentView ? deleteNode : undefined}
            onSelectedRunIdChange={setSelectedRunId}
            onSetActionType={setActionType}
            onUpdateNodeData={updateNodeData}
            isTriggerTypeLocked={isTriggerTypeLocked}
            selectedRunId={runId ?? null}
            selectedEdge={selectedEdge}
            selectedNode={selectedNode}
            workflowId={journeyQuery.data?.id ?? null}
          />
        </WorkflowSidebarPanel>
      )}

      <AlertDialog
        open={isRenameDialogOpen}
        onOpenChange={handleRenameDialogOpenChange}
      >
        <AlertDialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleRenameSubmit();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Rename journey</AlertDialogTitle>
              <AlertDialogDescription>
                Update the journey name shown in Workflows and navigation.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="mt-4">
              <Label htmlFor="rename-journey-name">Name *</Label>
              <Input
                id="rename-journey-name"
                value={renameInputValue}
                onChange={(event) => {
                  setRenameInputValue(event.target.value);
                  if (renameValidationError) {
                    setRenameValidationError(null);
                  }
                }}
                aria-invalid={renameValidationError !== null}
                ref={renameInputRef}
              />
              {renameValidationError ? (
                <p className="mt-1 text-xs text-destructive">
                  {renameValidationError}
                </p>
              ) : null}
            </div>

            <AlertDialogFooter className="mt-6">
              <AlertDialogCancel disabled={renameMutation.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                disabled={renameMutation.isPending}
                className={
                  renameMutation.isPending ? "disabled:opacity-100" : undefined
                }
              >
                {showRenamePendingVisual ? "Saving..." : "Save"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
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
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    sidebarTab?: WorkflowSidebarTabValue;
    runId?: string;
  } => {
    const rawSidebarTab =
      typeof search.sidebarTab === "string" ? search.sidebarTab : "";
    const sidebarTab = isWorkflowSidebarTabValue(rawSidebarTab)
      ? rawSidebarTab
      : undefined;
    const runId = typeof search.runId === "string" ? search.runId : undefined;

    return {
      sidebarTab,
      runId,
    };
  },
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
