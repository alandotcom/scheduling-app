import type { Edge, Node } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import {
  domainEventTypes,
  domainEventDomains,
  type DomainEventDomain,
  type DomainEventType,
} from "@scheduling/dto";
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
import { ActionGrid } from "./config/action-grid";
import { ActionConfig } from "./config/action-config";
import { buildEventAttributeSuggestions } from "./config/event-attribute-suggestions";
import { getAction } from "./action-registry";

type SwitchBranch = "created" | "updated" | "deleted";

type WorkflowEditorSidebarTab = "properties" | "runs";

interface WorkflowEditorSidebarProps {
  workflowId: string | null;
  selectedNode: Node | null;
  selectedEdge?: Edge | null;
  nodes?: Node[];
  edges?: Edge[];
  canManageWorkflow: boolean;
  onUpdateNodeData: (input: {
    id: string;
    data: Record<string, unknown>;
  }) => void;
  onSetActionType?: (input: { nodeId: string; actionType: string }) => void;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isDomainEventDomain(value: unknown): value is DomainEventDomain {
  return (
    typeof value === "string" &&
    domainEventDomains.some((domain) => domain === value)
  );
}

function isSwitchBranch(value: unknown): value is SwitchBranch {
  return value === "created" || value === "updated" || value === "deleted";
}

function isDomainEventType(value: unknown): value is DomainEventType {
  return (
    typeof value === "string" &&
    domainEventTypes.some((eventType) => eventType === value)
  );
}

function getTriggerDomain(nodes: Node[]): DomainEventDomain | null {
  const trigger = nodes.find((node) => getNodeType(node) === "trigger");
  if (!trigger) {
    return null;
  }

  const triggerConfig = toNodeConfig(trigger);
  return isDomainEventDomain(triggerConfig.domain)
    ? triggerConfig.domain
    : "appointment";
}

function getConfiguredTriggerEventTypes(nodes: Node[]): DomainEventType[] {
  const trigger = nodes.find((node) => getNodeType(node) === "trigger");
  if (!trigger) {
    return [];
  }

  const config = toNodeConfig(trigger);
  const configuredEventTypes = [
    ...toStringArray(config.startEvents),
    ...toStringArray(config.restartEvents),
    ...toStringArray(config.stopEvents),
  ];

  const allowedEventTypes = new Set<string>(domainEventTypes);
  return configuredEventTypes.filter(
    (eventType): eventType is DomainEventType =>
      allowedEventTypes.has(eventType),
  );
}

function getSwitchBranchFromEdge(edge: Edge): SwitchBranch | null {
  if (!isRecord(edge.data)) {
    return null;
  }

  const branch = edge.data.switchBranch;
  return isSwitchBranch(branch) ? branch : null;
}

function getUpstreamSwitchBranch(
  nodeId: string,
  edges: Edge[],
): SwitchBranch | null {
  const queue = [nodeId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (!currentNodeId || visited.has(currentNodeId)) {
      continue;
    }

    visited.add(currentNodeId);
    const incomingEdges = edges.filter((edge) => edge.target === currentNodeId);

    for (const edge of incomingEdges) {
      const branch = getSwitchBranchFromEdge(edge);
      if (branch) {
        return branch;
      }

      if (!visited.has(edge.source)) {
        queue.push(edge.source);
      }
    }
  }

  return null;
}

function toNodeReferenceName(node: Node): string {
  if (typeof node.data !== "object" || node.data === null) {
    return node.id;
  }

  const label = typeof node.data.label === "string" ? node.data.label : "";
  const compactLabel = label.replace(/[^A-Za-z0-9_]/g, "");
  if (compactLabel.length > 0) {
    return compactLabel;
  }

  const compactId = node.id.replace(/[^A-Za-z0-9_]/g, "");
  if (compactId.length > 0) {
    return compactId;
  }

  return `Node${node.id}`;
}

function parseOutputAttributes(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  const outputAttributes: string[] = [];
  const seen = new Set<string>();
  const segments = value
    .split(/[,\n]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  for (const segment of segments) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(segment)
    ) {
      continue;
    }

    if (seen.has(segment)) {
      continue;
    }

    seen.add(segment);
    outputAttributes.push(segment);
  }

  return outputAttributes;
}

function isDateTimeOutputAttribute(path: string): boolean {
  const normalizedPath = path.toLowerCase();
  return (
    normalizedPath.endsWith("at") ||
    normalizedPath.endsWith("time") ||
    normalizedPath.endsWith("timestamp") ||
    normalizedPath.endsWith("date")
  );
}

function getUpstreamNodes(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): Node[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const queue = [nodeId];
  const visited = new Set<string>([nodeId]);
  const upstreamNodes: Node[] = [];

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (!currentNodeId) {
      continue;
    }

    for (const edge of edges) {
      if (edge.target !== currentNodeId || visited.has(edge.source)) {
        continue;
      }

      visited.add(edge.source);
      queue.push(edge.source);

      const upstreamNode = nodeById.get(edge.source);
      if (upstreamNode) {
        upstreamNodes.push(upstreamNode);
      }
    }
  }

  return upstreamNodes;
}

export function buildUpstreamOutputSuggestions(input: {
  selectedNodeId: string;
  nodes: Node[];
  edges: Edge[];
}) {
  const suggestions = new Map<
    string,
    { value: string; type: string; isDateTime: boolean }
  >();

  const upstreamNodes = getUpstreamNodes(
    input.selectedNodeId,
    input.nodes,
    input.edges,
  );

  for (const node of upstreamNodes) {
    if (getNodeType(node) !== "action") {
      continue;
    }

    const nodeConfig = toNodeConfig(node);
    const actionType =
      typeof nodeConfig.actionType === "string" ? nodeConfig.actionType : null;
    const action = actionType ? getAction(actionType) : undefined;
    const staticAttributes = action?.outputAttributes ?? [];
    const configuredAttributes =
      actionType === "logger"
        ? []
        : parseOutputAttributes(nodeConfig.outputAttributes);
    const allOutputAttributes = [...staticAttributes, ...configuredAttributes];

    if (allOutputAttributes.length === 0) {
      continue;
    }

    const referenceName = toNodeReferenceName(node);
    for (const attribute of allOutputAttributes) {
      const value = `${referenceName}.${attribute}`;
      if (suggestions.has(value)) {
        continue;
      }

      suggestions.set(value, {
        value,
        type: "node output",
        isDateTime: isDateTimeOutputAttribute(attribute),
      });
    }
  }

  return [...suggestions.values()];
}

function toScopedDomainEventType(
  domain: DomainEventDomain,
  branch: SwitchBranch,
): DomainEventType {
  const eventType = `${domain}.${branch}`;
  return isDomainEventType(eventType) ? eventType : "appointment.scheduled";
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
  nodes = [],
  edges = [],
  canManageWorkflow,
  onUpdateNodeData,
  onSetActionType,
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
  const selectedNodeConfig = toNodeConfig(selectedNode);
  const selectedActionType =
    typeof selectedNodeConfig.actionType === "string"
      ? selectedNodeConfig.actionType
      : "";
  const isActionNodeWithoutType =
    selectedNodeType === "action" && selectedActionType.length === 0;
  const nodeEnabled = isNodeEnabled(selectedNode);
  const triggerDomain = getTriggerDomain(nodes);
  const triggerEventTypes = getConfiguredTriggerEventTypes(nodes);
  const selectedNodeBranch = selectedNode
    ? getUpstreamSwitchBranch(selectedNode.id, edges)
    : null;
  const actionExpressionSuggestions = useMemo(() => {
    if (selectedNodeType !== "action") {
      return [];
    }

    const eventSuggestions = triggerDomain
      ? buildEventAttributeSuggestions({
          domain: triggerDomain,
          eventTypes: selectedNodeBranch
            ? [toScopedDomainEventType(triggerDomain, selectedNodeBranch)]
            : triggerEventTypes,
        })
      : [];
    const outputSuggestions = selectedNode
      ? buildUpstreamOutputSuggestions({
          selectedNodeId: selectedNode.id,
          nodes,
          edges,
        })
      : [];
    const mergedSuggestions = new Map(
      [...eventSuggestions, ...outputSuggestions].map((suggestion) => [
        suggestion.value,
        suggestion,
      ]),
    );

    return [...mergedSuggestions.values()];
  }, [
    edges,
    nodes,
    selectedNode,
    selectedNodeBranch,
    selectedNodeType,
    triggerDomain,
    triggerEventTypes,
  ]);

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

  const handleSelectActionType = (actionType: string) => {
    if (!selectedNode || !canManageWorkflow) {
      return;
    }

    if (onSetActionType) {
      onSetActionType({
        nodeId: selectedNode.id,
        actionType,
      });
      return;
    }

    onUpdateNodeData({
      id: selectedNode.id,
      data: {
        config: {
          ...selectedNodeConfig,
          actionType,
        },
      },
    });
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
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
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
                {isActionNodeWithoutType ? (
                  canManageWorkflow ? (
                    <ActionGrid
                      disabled={!canManageWorkflow}
                      onSelectAction={handleSelectActionType}
                    />
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      No action configured for this step.
                    </p>
                  )
                ) : (
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
                      <Label htmlFor="workflow-node-description">
                        Description
                      </Label>
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
                              description:
                                event.target.value.trim() || undefined,
                            },
                          });
                        }}
                        value={descriptionValue}
                      />
                    </div>

                    {selectedNodeType === "trigger" ? (
                      <WorkflowTriggerConfig
                        config={selectedNodeConfig}
                        disabled={!canManageWorkflow}
                        onUpdate={(next) => {
                          onUpdateNodeData({
                            id: selectedNode.id,
                            data: {
                              config: {
                                ...selectedNodeConfig,
                                triggerType: "DomainEvent",
                                domain:
                                  selectedNodeConfig.domain ?? "appointment",
                                ...next,
                              },
                            },
                          });
                        }}
                      />
                    ) : (
                      <>
                        <ActionConfig
                          config={selectedNodeConfig}
                          onUpdateConfig={(key, value) => {
                            if (
                              key === "actionType" &&
                              typeof value === "string" &&
                              onSetActionType
                            ) {
                              onSetActionType({
                                nodeId: selectedNode.id,
                                actionType: value,
                              });
                              return;
                            }

                            const actionType =
                              typeof selectedNodeConfig.actionType === "string"
                                ? selectedNodeConfig.actionType
                                : "";

                            if (
                              actionType === "wait" &&
                              key === "waitDelayTimingMode" &&
                              typeof value === "string"
                            ) {
                              if (value === "duration") {
                                onUpdateNodeData({
                                  id: selectedNode.id,
                                  data: {
                                    config: {
                                      ...selectedNodeConfig,
                                      waitDelayTimingMode: "duration",
                                      waitUntil: "",
                                      waitOffset: "",
                                    },
                                  },
                                });
                                return;
                              }

                              if (value === "until") {
                                onUpdateNodeData({
                                  id: selectedNode.id,
                                  data: {
                                    config: {
                                      ...selectedNodeConfig,
                                      waitDelayTimingMode: "until",
                                      waitDuration: "",
                                    },
                                  },
                                });
                                return;
                              }
                            }

                            onUpdateNodeData({
                              id: selectedNode.id,
                              data: {
                                config: {
                                  ...selectedNodeConfig,
                                  [key]: value,
                                },
                              },
                            });
                          }}
                          disabled={!canManageWorkflow}
                          expressionSuggestions={actionExpressionSuggestions}
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
