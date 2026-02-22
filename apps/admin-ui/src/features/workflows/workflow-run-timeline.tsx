import { useState } from "react";
import type {
  JourneyRun,
  JourneyRunDelivery,
  JourneyRunDetailResponse,
  JourneyRunStepLog,
} from "@scheduling/dto";
import { formatDisplayDateTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import {
  formatDurationMs,
  getDeliveryStatusDotColorClass,
  getStepStatusDotColorClass,
  toDeliveryStatusLabel,
  toDisplayStepLogStatus,
  toNodeTypeLabel,
  toReasonCodeLabel,
  toStepLogDisplaySubtitle,
  toStepLogStatusLabel,
  toTimelineLabel,
} from "./workflow-runs-helpers";
import { WorkflowRunStepDetail } from "./workflow-run-step-detail";

interface WorkflowRunTimelineProps {
  runDetail: JourneyRunDetailResponse;
  stepLabelByStepKey: Record<string, string>;
  nodeTypeByStepKey: Record<string, string>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  nowMs: number;
}

export function WorkflowRunTimeline({
  runDetail,
  stepLabelByStepKey,
  nodeTypeByStepKey,
  selectedNodeId,
  onSelectNode,
  nowMs,
}: WorkflowRunTimelineProps) {
  const { stepLogs, deliveries } = runDetail;
  const runStatus = runDetail.run.status;

  if (stepLogs.length > 0) {
    return (
      <StepLogTimeline
        stepLogs={stepLogs}
        runStatus={runStatus}
        stepLabelByStepKey={stepLabelByStepKey}
        nodeTypeByStepKey={nodeTypeByStepKey}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
        nowMs={nowMs}
        triggerContext={runDetail.triggerContext}
      />
    );
  }

  if (deliveries.length > 0) {
    return (
      <DeliveryTimeline
        deliveries={deliveries}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
      />
    );
  }

  return (
    <p className="text-muted-foreground text-xs">No timeline entries yet.</p>
  );
}

// ---------------------------------------------------------------------------
// Step Log Timeline
// ---------------------------------------------------------------------------

function StepLogTimeline({
  stepLogs,
  runStatus,
  stepLabelByStepKey,
  nodeTypeByStepKey,
  selectedNodeId,
  onSelectNode,
  nowMs,
  triggerContext,
}: {
  stepLogs: JourneyRunStepLog[];
  runStatus: JourneyRun["status"];
  stepLabelByStepKey: Record<string, string>;
  nodeTypeByStepKey: Record<string, string>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  nowMs: number;
  triggerContext: JourneyRunDetailResponse["triggerContext"];
}) {
  // Track which steps are expanded locally (independent of canvas selection)
  const [expandedStepKeys, setExpandedStepKeys] = useState<Set<string>>(
    () => new Set(),
  );

  const handleStepClick = (stepKey: string) => {
    const isExpanded = expandedStepKeys.has(stepKey);

    setExpandedStepKeys((previous) => {
      const next = new Set(previous);

      if (next.has(stepKey)) {
        next.delete(stepKey);
      } else {
        next.add(stepKey);
      }

      return next;
    });

    if (isExpanded) {
      if (selectedNodeId === stepKey) {
        onSelectNode(null);
      }
      return;
    }

    onSelectNode(stepKey);
  };

  return (
    <div className="relative">
      {stepLogs.map((stepLog, index) => {
        const displayStatus = toDisplayStepLogStatus({
          stepLog,
          runStatus,
        });
        const stepLabel =
          stepLabelByStepKey[stepLog.stepKey] ??
          toNodeTypeLabel(stepLog.nodeType);
        const subtitle = toStepLogDisplaySubtitle({
          stepLog,
          displayStatus,
          nowMs,
        });
        const duration = formatDurationMs(stepLog.durationMs);
        const isSelected =
          selectedNodeId === stepLog.stepKey ||
          expandedStepKeys.has(stepLog.stepKey);
        const isLast = index === stepLogs.length - 1;
        const isTriggerStep = nodeTypeByStepKey[stepLog.stepKey] === "trigger";

        return (
          <div key={stepLog.id} className="relative">
            {/* Vertical connecting line */}
            {!isLast ? (
              <div className="absolute left-[7px] top-5 bottom-0 w-px bg-border" />
            ) : null}

            <button
              className="group relative flex w-full items-start gap-3 py-2 text-left"
              onClick={() => handleStepClick(stepLog.stepKey)}
              type="button"
            >
              {/* Status dot (sits on the line) */}
              <span
                className={cn(
                  "relative z-10 mt-1 size-[15px] shrink-0 rounded-full ring-2 ring-background",
                  getStepStatusDotColorClass(displayStatus),
                )}
              />

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm">{stepLabel}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          getStepStatusDotColorClass(displayStatus),
                        )}
                      />
                      {toStepLogStatusLabel(displayStatus)}
                    </span>
                    {duration ? (
                      <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
                        {duration}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDisplayDateTime(stepLog.startedAt)}
                </p>
                {subtitle && !isSelected ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </button>

            {/* Inline expanded detail */}
            {isSelected ? (
              <WorkflowRunStepDetail
                stepLog={stepLog}
                runStatus={runStatus}
                triggerContext={triggerContext}
                isTriggerStep={isTriggerStep}
                nowMs={nowMs}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delivery-only Timeline (fallback when stepLogs are empty)
// ---------------------------------------------------------------------------

function DeliveryTimeline({
  deliveries,
  selectedNodeId,
  onSelectNode,
}: {
  deliveries: JourneyRunDelivery[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}) {
  return (
    <div className="relative">
      {deliveries.map((delivery, index) => {
        const isSelected = selectedNodeId === delivery.stepKey;
        const isLast = index === deliveries.length - 1;
        const reasonLabel = toReasonCodeLabel(delivery.reasonCode);

        return (
          <div key={delivery.id} className="relative">
            {!isLast ? (
              <div className="absolute left-[7px] top-5 bottom-0 w-px bg-border" />
            ) : null}

            <button
              className="group relative flex w-full items-start gap-3 py-2 text-left"
              onClick={() => onSelectNode(isSelected ? null : delivery.stepKey)}
              type="button"
            >
              <span
                className={cn(
                  "relative z-10 mt-1 size-[15px] shrink-0 rounded-full ring-2 ring-background",
                  getDeliveryStatusDotColorClass(delivery.status),
                )}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm">
                    {toTimelineLabel(delivery)}
                  </p>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        getDeliveryStatusDotColorClass(delivery.status),
                      )}
                    />
                    {toDeliveryStatusLabel(delivery.status)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDisplayDateTime(delivery.scheduledFor)}
                </p>
                {reasonLabel ? (
                  <p className="text-xs text-muted-foreground">{reasonLabel}</p>
                ) : null}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
