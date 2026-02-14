import type { Node } from "@xyflow/react";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WorkflowRunsPanel } from "./workflow-runs-panel";
import { WorkflowTriggerConfig } from "./workflow-trigger-config";

type WorkflowEditorSidebarTab = "properties" | "runs";

interface WorkflowEditorSidebarProps {
  workflowId: string | null;
  selectedNode: Node | null;
  canManageWorkflow: boolean;
  onUpdateNodeData: (input: {
    id: string;
    data: Record<string, unknown>;
  }) => void;
}

function toNodeLabel(node: Node | null): string {
  if (!node || typeof node.data !== "object" || node.data === null) {
    return "";
  }

  return typeof node.data.label === "string" ? node.data.label : "";
}

function toNodeDescription(node: Node | null): string {
  if (!node || typeof node.data !== "object" || node.data === null) {
    return "";
  }

  return typeof node.data.description === "string" ? node.data.description : "";
}

function toNodeConfig(node: Node | null): Record<string, unknown> {
  if (
    !node ||
    typeof node.data !== "object" ||
    node.data === null ||
    typeof node.data.config !== "object" ||
    node.data.config === null
  ) {
    return {};
  }

  return { ...node.data.config };
}

export function WorkflowEditorSidebar({
  workflowId,
  selectedNode,
  canManageWorkflow,
  onUpdateNodeData,
}: WorkflowEditorSidebarProps) {
  const [activeTab, setActiveTab] =
    useState<WorkflowEditorSidebarTab>("properties");

  const selectedNodeType =
    selectedNode &&
    typeof selectedNode.data === "object" &&
    selectedNode.data !== null &&
    typeof selectedNode.data.type === "string"
      ? selectedNode.data.type
      : null;

  return (
    <aside className="flex h-[68vh] w-full flex-col overflow-hidden rounded-xl border border-border bg-card md:w-[380px]">
      <div className="flex gap-1 border-b p-2">
        <Button
          onClick={() => setActiveTab("properties")}
          size="sm"
          variant={activeTab === "properties" ? "default" : "ghost"}
        >
          Properties
        </Button>
        <Button
          onClick={() => setActiveTab("runs")}
          size="sm"
          variant={activeTab === "runs" ? "default" : "ghost"}
        >
          Runs
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {activeTab === "runs" ? (
          <WorkflowRunsPanel
            canManageWorkflow={canManageWorkflow}
            workflowId={workflowId}
          />
        ) : null}

        {activeTab === "properties" ? (
          <div className="space-y-4">
            {selectedNode ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="workflow-node-label">Label</Label>
                  <Input
                    defaultValue={toNodeLabel(selectedNode)}
                    disabled={!canManageWorkflow}
                    id="workflow-node-label"
                    onBlur={(event) => {
                      onUpdateNodeData({
                        id: selectedNode.id,
                        data: { label: event.target.value },
                      });
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="workflow-node-description">Description</Label>
                  <Input
                    defaultValue={toNodeDescription(selectedNode)}
                    disabled={!canManageWorkflow}
                    id="workflow-node-description"
                    onBlur={(event) => {
                      onUpdateNodeData({
                        id: selectedNode.id,
                        data: {
                          description: event.target.value.trim() || undefined,
                        },
                      });
                    }}
                  />
                </div>

                {selectedNodeType === "trigger" ? (
                  <WorkflowTriggerConfig
                    config={toNodeConfig(selectedNode)}
                    disabled={!canManageWorkflow}
                    onUpdate={(next) => {
                      onUpdateNodeData({
                        id: selectedNode.id,
                        data: {
                          config: {
                            ...toNodeConfig(selectedNode),
                            triggerType: "DomainEvent",
                            ...next,
                          },
                        },
                      });
                    }}
                  />
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Action node configuration editors are added in a follow-up
                    step.
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                Select a node to configure it, or open the Runs tab to inspect
                execution history.
              </p>
            )}

            {!canManageWorkflow ? (
              <p className="text-muted-foreground text-xs">
                Read-only mode: members can inspect workflow configuration and
                runs, but cannot mutate settings.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
