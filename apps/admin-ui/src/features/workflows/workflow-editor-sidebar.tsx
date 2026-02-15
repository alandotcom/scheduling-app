import type { Edge, Node } from "@xyflow/react";
import { useEffect, useState } from "react";
import {
  Delete01Icon,
  ViewIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { WorkflowRunsPanel } from "./workflow-runs-panel";
import { WorkflowTriggerConfig } from "./workflow-trigger-config";
import { ActionConfig } from "./config/action-config";

type WorkflowEditorSidebarTab = "properties" | "runs";

interface WorkflowEditorSidebarProps {
  workflowId: string | null;
  selectedNode: Node | null;
  selectedEdge?: Edge | null;
  canManageWorkflow: boolean;
  onUpdateNodeData: (input: {
    id: string;
    data: Record<string, unknown>;
  }) => void;
  onDeleteNode?: (nodeId: string) => void;
  onDeleteEdge?: (edgeId: string) => void;
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

function getNodeType(node: Node | null): string | null {
  if (
    !node ||
    typeof node.data !== "object" ||
    node.data === null ||
    typeof node.data.type !== "string"
  ) {
    return null;
  }
  return node.data.type;
}

function isNodeEnabled(node: Node | null): boolean {
  if (!node || typeof node.data !== "object" || node.data === null) {
    return true;
  }
  return node.data.enabled !== false;
}

export function WorkflowEditorSidebar({
  workflowId,
  selectedNode,
  selectedEdge = null,
  canManageWorkflow,
  onUpdateNodeData,
  onDeleteNode,
  onDeleteEdge,
}: WorkflowEditorSidebarProps) {
  const [activeTab, setActiveTab] =
    useState<WorkflowEditorSidebarTab>("properties");
  const [labelValue, setLabelValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState("");
  const [showDeleteNodeDialog, setShowDeleteNodeDialog] = useState(false);
  const [showDeleteEdgeDialog, setShowDeleteEdgeDialog] = useState(false);

  useEffect(() => {
    setLabelValue(toNodeLabel(selectedNode));
    setDescriptionValue(toNodeDescription(selectedNode));
  }, [selectedNode]);

  const selectedNodeType = getNodeType(selectedNode);
  const nodeEnabled = isNodeEnabled(selectedNode);

  const handleToggleEnabled = () => {
    if (!selectedNode || !canManageWorkflow) return;
    onUpdateNodeData({
      id: selectedNode.id,
      data: { enabled: !nodeEnabled },
    });
  };

  const handleDeleteNode = () => {
    if (!selectedNode || !onDeleteNode) return;
    onDeleteNode(selectedNode.id);
    setShowDeleteNodeDialog(false);
  };

  const handleDeleteEdge = () => {
    if (!selectedEdge || !onDeleteEdge) return;
    onDeleteEdge(selectedEdge.id);
    setShowDeleteEdgeDialog(false);
  };

  return (
    <aside className="flex size-full flex-col overflow-hidden bg-card">
      {/* Segment control tabs */}
      <div className="shrink-0 border-b px-4 py-2.5">
        <div className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
          <button
            className={`inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-sm px-2 py-1 font-medium text-sm transition-[color,box-shadow] ${
              activeTab === "properties"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
            onClick={() => setActiveTab("properties")}
            type="button"
          >
            Properties
          </button>
          <button
            className={`inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-sm px-2 py-1 font-medium text-sm transition-[color,box-shadow] ${
              activeTab === "runs"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
            onClick={() => setActiveTab("runs")}
            type="button"
          >
            Runs
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "runs" ? (
          <div className="p-4">
            <WorkflowRunsPanel
              canManageWorkflow={canManageWorkflow}
              workflowId={workflowId}
            />
          </div>
        ) : null}

        {activeTab === "properties" ? (
          <div className="space-y-4 p-4">
            {/* Edge selected */}
            {selectedEdge && !selectedNode ? (
              <>
                <div className="space-y-1">
                  <h3 className="font-medium text-sm">Edge</h3>
                  <p className="text-muted-foreground text-xs">
                    Connection between two nodes.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edge-id">Edge ID</Label>
                  <Input
                    disabled
                    id="edge-id"
                    readOnly
                    value={selectedEdge.id}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edge-source">Source</Label>
                  <Input
                    disabled
                    id="edge-source"
                    readOnly
                    value={selectedEdge.source}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edge-target">Target</Label>
                  <Input
                    disabled
                    id="edge-target"
                    readOnly
                    value={selectedEdge.target}
                  />
                </div>

                {canManageWorkflow && onDeleteEdge ? (
                  <Button
                    className="w-full"
                    onClick={() => setShowDeleteEdgeDialog(true)}
                    size="sm"
                    variant="destructive"
                  >
                    <Icon icon={Delete01Icon} className="size-4" />
                    Delete edge
                  </Button>
                ) : null}
              </>
            ) : null}

            {/* Node selected */}
            {selectedNode ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="workflow-node-label">Label</Label>
                  <Input
                    disabled={!canManageWorkflow}
                    id="workflow-node-label"
                    onChange={(event) => {
                      setLabelValue(event.target.value);
                    }}
                    onBlur={(event) => {
                      onUpdateNodeData({
                        id: selectedNode.id,
                        data: { label: event.target.value },
                      });
                    }}
                    value={labelValue}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="workflow-node-description">Description</Label>
                  <Input
                    disabled={!canManageWorkflow}
                    id="workflow-node-description"
                    onChange={(event) => {
                      setDescriptionValue(event.target.value);
                    }}
                    onBlur={(event) => {
                      onUpdateNodeData({
                        id: selectedNode.id,
                        data: {
                          description: event.target.value.trim() || undefined,
                        },
                      });
                    }}
                    value={descriptionValue}
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
                  <>
                    <ActionConfig
                      config={toNodeConfig(selectedNode)}
                      onUpdateConfig={(key, value) => {
                        onUpdateNodeData({
                          id: selectedNode.id,
                          data: {
                            config: {
                              ...toNodeConfig(selectedNode),
                              [key]: value,
                            },
                          },
                        });
                      }}
                      disabled={!canManageWorkflow}
                    />

                    {/* Enable/disable toggle for action nodes */}
                    {canManageWorkflow ? (
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={handleToggleEnabled}
                          size="sm"
                          variant="outline"
                        >
                          <Icon
                            icon={nodeEnabled ? ViewOffIcon : ViewIcon}
                            className="size-4"
                          />
                          {nodeEnabled ? "Disable" : "Enable"}
                        </Button>

                        {/* Delete button for action nodes */}
                        {onDeleteNode ? (
                          <Button
                            onClick={() => setShowDeleteNodeDialog(true)}
                            size="sm"
                            variant="destructive"
                          >
                            <Icon icon={Delete01Icon} className="size-4" />
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </>
            ) : null}

            {/* No node or edge selected */}
            {!selectedNode && !selectedEdge ? (
              <p className="text-muted-foreground text-sm">
                Select a node to configure it, or open the Runs tab to inspect
                execution history.
              </p>
            ) : null}

            {!canManageWorkflow ? (
              <p className="text-muted-foreground text-xs">
                Read-only mode: members can inspect workflow configuration and
                runs, but cannot mutate settings.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Delete node confirmation */}
      <DeleteConfirmDialog
        description="Are you sure you want to delete this action node? This will also remove all connected edges. This action cannot be undone."
        onConfirm={handleDeleteNode}
        onOpenChange={setShowDeleteNodeDialog}
        open={showDeleteNodeDialog}
        title="Delete action node"
      />

      {/* Delete edge confirmation */}
      <DeleteConfirmDialog
        description="Are you sure you want to delete this connection? This action cannot be undone."
        onConfirm={handleDeleteEdge}
        onOpenChange={setShowDeleteEdgeDialog}
        open={showDeleteEdgeDialog}
        title="Delete edge"
      />
    </aside>
  );
}
