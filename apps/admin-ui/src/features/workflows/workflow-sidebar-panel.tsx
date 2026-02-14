import { useState } from "react";
import type {
  WorkflowActionCatalogItem,
  WorkflowRunSummary,
  WorkflowStepLogEntry,
} from "@scheduling/dto";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import type {
  EditorEdge,
  EditorNode,
  WorkflowBranch,
} from "./workflow-editor-types";
import { NodeConfigPanel } from "./node-config-panel";
import { WorkflowRuns } from "./workflow-runs";

type WorkflowSidebarPanelProps = {
  selectedNode: EditorNode | null;
  selectedEdge: EditorEdge | null;
  actions: WorkflowActionCatalogItem[];
  runs: WorkflowRunSummary[];
  selectedRunId: string | null;
  stepLogs: WorkflowStepLogEntry[];
  isRunsLoading: boolean;
  isStepLogsLoading: boolean;
  isCancelingRun: boolean;
  onSelectRun: (runId: string) => void;
  onCancelRun: () => void;
  onUpdateNode: (updater: (node: EditorNode) => EditorNode) => void;
  onDeleteNode: () => void;
  onUpdateEdgeBranch: (branch: WorkflowBranch | undefined) => void;
  onDeleteEdge: () => void;
};

export function WorkflowSidebarPanel({
  selectedNode,
  selectedEdge,
  actions,
  runs,
  selectedRunId,
  stepLogs,
  isRunsLoading,
  isStepLogsLoading,
  isCancelingRun,
  onSelectRun,
  onCancelRun,
  onUpdateNode,
  onDeleteNode,
  onUpdateEdgeBranch,
  onDeleteEdge,
}: WorkflowSidebarPanelProps) {
  const [tab, setTab] = useState<"properties" | "runs">("properties");
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="relative border-l bg-background">
        <Button
          className="absolute left-1/2 top-4 -translate-x-1/2"
          onClick={() => setCollapsed(false)}
          size="icon-sm"
          variant="outline"
        >
          <Icon icon={ArrowLeft01Icon} className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <aside className="flex h-full w-[26rem] min-w-[22rem] flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex gap-2">
          <Button
            onClick={() => setTab("properties")}
            size="sm"
            variant={tab === "properties" ? "secondary" : "ghost"}
          >
            Properties
          </Button>
          <Button
            onClick={() => setTab("runs")}
            size="sm"
            variant={tab === "runs" ? "secondary" : "ghost"}
          >
            Runs
          </Button>
        </div>
        <Button
          onClick={() => setCollapsed(true)}
          size="icon-sm"
          variant="ghost"
        >
          <Icon icon={ArrowRight01Icon} className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "properties" ? (
          <NodeConfigPanel
            actions={actions}
            selectedEdge={selectedEdge}
            selectedNode={selectedNode}
            onDeleteEdge={onDeleteEdge}
            onDeleteNode={onDeleteNode}
            onUpdateEdgeBranch={onUpdateEdgeBranch}
            onUpdateNode={onUpdateNode}
          />
        ) : (
          <div className="h-full p-3">
            <WorkflowRuns
              isCancelingRun={isCancelingRun}
              isRunsLoading={isRunsLoading}
              isStepLogsLoading={isStepLogsLoading}
              runs={runs}
              selectedRunId={selectedRunId}
              stepLogs={stepLogs}
              onCancelRun={onCancelRun}
              onSelectRun={onSelectRun}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
