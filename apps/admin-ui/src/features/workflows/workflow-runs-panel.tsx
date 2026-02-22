import { useCallback, useEffect, useRef } from "react";
import type {
  JourneyRun,
  JourneyRunDetailResponse,
  JourneyRunListItem,
} from "@scheduling/dto";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { orpc } from "@/lib/query";
import { cn } from "@/lib/utils";
import {
  deserializeWorkflowGraph,
  setWorkflowEditorSelectionAtom,
  selectedExecutionIdAtom,
  workflowExecutionEdgeStatusByEdgeIdAtom,
  workflowExecutionViewGraphAtom,
  workflowEditorSelectedNodeIdAtom,
  workflowExecutionLogsByNodeIdAtom,
} from "./workflow-editor-store";
import {
  getEdgeExecutionStatusMap,
  parseRunSnapshotGraph,
  resolveStepLogWaitUntil,
  toDisplayStepLogStatus,
  toNodeLogStatus,
  toRunNodeLogStatus,
} from "./workflow-runs-helpers";
import { WorkflowRunsList } from "./workflow-runs-list";
import { WorkflowRunDetail } from "./workflow-run-detail";

interface WorkflowRunsPanelProps {
  workflowId: string | null;
  canManageWorkflow: boolean;
}

type WorkflowRunsPanelRun = JourneyRun & {
  sidebarSummary?: JourneyRunListItem["sidebarSummary"];
};

export interface WorkflowRunsPanelViewProps {
  runs: WorkflowRunsPanelRun[];
  selectedRunId: string | null;
  selectedRunDetail: JourneyRunDetailResponse | null;
  canManageWorkflow: boolean;
  isLoadingRuns: boolean;
  isLoadingRunDetail: boolean;
  onSelectRun: (runId: string | null) => void;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  onRefresh: () => void;
  onCancelRun?: (runId: string) => void;
  onCancelJourneyRuns?: () => void;
  isCancelRunPending?: boolean;
  isCancelJourneyRunsPending?: boolean;
}

export function WorkflowRunsPanelView({
  runs,
  selectedRunId,
  selectedRunDetail,
  canManageWorkflow,
  isLoadingRuns,
  isLoadingRunDetail,
  onSelectRun,
  selectedNodeId = null,
  onSelectNode,
  onRefresh,
  onCancelRun,
  onCancelJourneyRuns,
  isCancelRunPending = false,
  isCancelJourneyRunsPending = false,
}: WorkflowRunsPanelViewProps) {
  const selectedRun = selectedRunId
    ? (runs.find((r) => r.id === selectedRunId) ?? null)
    : null;
  const overlayRef = useRef<HTMLDivElement>(null);
  const runRowRefs = useRef(new Map<string, HTMLButtonElement>());

  const setRunRowRef = useCallback(
    (runId: string, element: HTMLButtonElement | null) => {
      if (element) {
        runRowRefs.current.set(runId, element);
        return;
      }

      runRowRefs.current.delete(runId);
    },
    [],
  );

  const handleSelectRun = useCallback(
    (runId: string) => {
      onSelectRun(runId);
    },
    [onSelectRun],
  );

  const handleCloseDetail = useCallback(() => {
    const runIdToFocus = selectedRun?.id ?? null;
    onSelectRun(null);

    if (!runIdToFocus) {
      return;
    }

    window.requestAnimationFrame(() => {
      runRowRefs.current.get(runIdToFocus)?.focus({ preventScroll: true });
    });
  }, [onSelectRun, selectedRun]);

  useEffect(() => {
    if (!selectedRun) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      overlayRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [selectedRun]);

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1">
        <WorkflowRunsList
          runs={runs}
          isLoading={isLoadingRuns}
          selectedRunId={selectedRunId}
          onSelectRun={handleSelectRun}
          onRunRowRef={setRunRowRef}
          onRefresh={onRefresh}
        />
      </div>

      <div
        aria-hidden={!selectedRun}
        className={cn(
          "absolute inset-0 z-10 flex h-full flex-col overflow-hidden bg-card transition-opacity duration-150 ease-out motion-reduce:transition-none",
          selectedRun ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !selectedRun) {
            return;
          }

          event.stopPropagation();
          handleCloseDetail();
        }}
        ref={overlayRef}
        role="region"
        aria-label="Run details"
        tabIndex={selectedRun ? -1 : undefined}
      >
        {selectedRun ? (
          <WorkflowRunDetail
            run={selectedRun}
            runDetail={selectedRunDetail}
            isLoadingDetail={isLoadingRunDetail}
            canManageWorkflow={canManageWorkflow}
            selectedNodeId={selectedNodeId}
            onSelectNode={(nodeId) => onSelectNode?.(nodeId)}
            onBack={handleCloseDetail}
            onCancelRun={onCancelRun}
            onCancelJourneyRuns={onCancelJourneyRuns}
            isCancelRunPending={isCancelRunPending}
            isCancelJourneyRunsPending={isCancelJourneyRunsPending}
          />
        ) : null}
      </div>
    </section>
  );
}

export function WorkflowRunsPanel({
  workflowId,
  canManageWorkflow,
}: WorkflowRunsPanelProps) {
  const [selectedExecutionId, setSelectedExecutionId] = useAtom(
    selectedExecutionIdAtom,
  );
  const selectedNodeId = useAtomValue(workflowEditorSelectedNodeIdAtom);
  const [, setExecutionLogsByNodeId] = useAtom(
    workflowExecutionLogsByNodeIdAtom,
  );
  const setExecutionEdgeStatusByEdgeId = useSetAtom(
    workflowExecutionEdgeStatusByEdgeIdAtom,
  );
  const setExecutionViewGraph = useSetAtom(workflowExecutionViewGraphAtom);
  const setSelection = useSetAtom(setWorkflowEditorSelectionAtom);
  const queryClient = useQueryClient();

  const cancelRunMutation = useMutation(
    orpc.journeys.runs.cancel.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.journeys.runs.list.key(),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.journeys.runs.get.key(),
        });
      },
    }),
  );

  const cancelJourneyRunsMutation = useMutation(
    orpc.journeys.cancelRuns.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: orpc.journeys.runs.list.key(),
        });
        queryClient.invalidateQueries({
          queryKey: orpc.journeys.runs.get.key(),
        });
      },
    }),
  );

  const runsQuery = useQuery({
    ...orpc.journeys.runs.list.queryOptions({
      input: {
        id: workflowId ?? "00000000-0000-0000-0000-000000000000",
        limit: 20,
      },
    }),
    enabled: Boolean(workflowId),
    refetchInterval: (query) => {
      const hasActiveRuns =
        query.state.data?.some(
          (run) => run.status === "running" || run.status === "planned",
        ) ?? false;

      return hasActiveRuns ? 2000 : false;
    },
  });

  const runDetailQuery = useQuery({
    ...orpc.journeys.runs.get.queryOptions({
      input: {
        runId: selectedExecutionId ?? "00000000-0000-0000-0000-000000000000",
      },
    }),
    enabled: Boolean(selectedExecutionId),
    refetchInterval: 2000,
  });

  useEffect(
    () => () => {
      setSelectedExecutionId(null);
      setExecutionLogsByNodeId({});
      setExecutionEdgeStatusByEdgeId({});
      setExecutionViewGraph(null);
    },
    [
      setExecutionEdgeStatusByEdgeId,
      setExecutionLogsByNodeId,
      setExecutionViewGraph,
      setSelectedExecutionId,
    ],
  );

  useEffect(() => {
    if (!selectedExecutionId || !runDetailQuery.data) {
      setExecutionLogsByNodeId({});
      setExecutionEdgeStatusByEdgeId({});
      setExecutionViewGraph(null);
      return;
    }

    const runSnapshotGraph = parseRunSnapshotGraph(runDetailQuery.data);
    setExecutionViewGraph(
      runSnapshotGraph ? deserializeWorkflowGraph(runSnapshotGraph) : null,
    );

    const latestByStep = runDetailQuery.data.stepLogs.reduce<
      Record<
        string,
        {
          nodeId: string;
          status: "pending" | "running" | "success" | "error" | "cancelled";
          input?: unknown;
          output?: unknown;
          waitUntil?: string | Date;
          error?: string | null;
          startedAt?: string | Date;
        }
      >
    >((acc, stepLog) => {
      const displayStatus = toDisplayStepLogStatus({
        stepLog,
        runStatus: runDetailQuery.data.run.status,
      });
      acc[stepLog.stepKey] = {
        nodeId: stepLog.stepKey,
        status: toNodeLogStatus(displayStatus),
        input: stepLog.input ?? undefined,
        output: stepLog.output ?? undefined,
        waitUntil: resolveStepLogWaitUntil(stepLog),
        error: stepLog.error,
        startedAt: stepLog.startedAt,
      };

      return acc;
    }, {});

    const triggerNodeId = runSnapshotGraph?.nodes.find(
      (node) => node.attributes.data.type === "trigger",
    )?.attributes.id;
    if (triggerNodeId) {
      latestByStep[triggerNodeId] = {
        nodeId: triggerNodeId,
        status: toRunNodeLogStatus(runDetailQuery.data.run.status),
        startedAt: runDetailQuery.data.run.startedAt,
      };
    }

    setExecutionLogsByNodeId(latestByStep);
    setExecutionEdgeStatusByEdgeId(
      getEdgeExecutionStatusMap(runDetailQuery.data),
    );
  }, [
    runDetailQuery.data,
    selectedExecutionId,
    setExecutionEdgeStatusByEdgeId,
    setExecutionLogsByNodeId,
    setExecutionViewGraph,
  ]);

  if (!workflowId) {
    return (
      <p className="text-muted-foreground text-sm">
        Save the workflow before viewing run history.
      </p>
    );
  }

  return (
    <WorkflowRunsPanelView
      canManageWorkflow={canManageWorkflow}
      isLoadingRunDetail={runDetailQuery.isLoading}
      isLoadingRuns={runsQuery.isLoading}
      onRefresh={() => {
        queryClient.invalidateQueries({
          queryKey: orpc.journeys.runs.list.key(),
        });
      }}
      onSelectNode={(nodeId) => {
        setSelection({ nodeId, edgeId: null });
      }}
      onSelectRun={setSelectedExecutionId}
      onCancelJourneyRuns={() => {
        if (!workflowId) {
          return;
        }

        cancelJourneyRunsMutation.mutate({ id: workflowId });
      }}
      onCancelRun={(runId) => {
        cancelRunMutation.mutate({ runId });
      }}
      runs={runsQuery.data ?? []}
      isCancelJourneyRunsPending={cancelJourneyRunsMutation.isPending}
      isCancelRunPending={cancelRunMutation.isPending}
      selectedNodeId={selectedNodeId}
      selectedRunDetail={runDetailQuery.data ?? null}
      selectedRunId={selectedExecutionId}
    />
  );
}
