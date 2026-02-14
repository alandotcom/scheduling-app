import { useMemo, useState } from "react";
import type { WorkflowActionCatalogItem } from "@scheduling/dto";
import { Delete01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  EditorEdge,
  EditorNode,
  WorkflowBranch,
} from "./workflow-editor-types";
import { ActionConfig } from "./config/action-config";
import { ConditionConfig } from "./config/condition-config";
import { TriggerConfig } from "./config/trigger-config";
import { isRecord, isWorkflowBranch } from "./workflow-editor-utils";

type NodeConfigPanelProps = {
  selectedNode: EditorNode | null;
  selectedEdge: EditorEdge | null;
  actions: WorkflowActionCatalogItem[];
  onUpdateNode: (updater: (node: EditorNode) => EditorNode) => void;
  onDeleteNode: () => void;
  onUpdateEdgeBranch: (branch: WorkflowBranch | undefined) => void;
  onDeleteEdge: () => void;
};

function getActionType(config: Record<string, unknown>): string {
  if (typeof config.actionType === "string") {
    return config.actionType;
  }
  if (typeof config.actionId === "string") {
    return config.actionId;
  }
  return "";
}

export function NodeConfigPanel({
  selectedNode,
  selectedEdge,
  actions,
  onUpdateNode,
  onDeleteNode,
  onUpdateEdgeBranch,
  onDeleteEdge,
}: NodeConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<"properties" | "raw">(
    "properties",
  );

  const selectedNodeConfig = useMemo(
    () =>
      selectedNode && isRecord(selectedNode.data.config)
        ? selectedNode.data.config
        : {},
    [selectedNode],
  );

  if (!selectedNode && !selectedEdge) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Select a node or edge to edit details.
      </div>
    );
  }

  if (selectedEdge) {
    const currentBranch = isWorkflowBranch(selectedEdge.data?.branch)
      ? selectedEdge.data?.branch
      : "";

    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Edge settings</h3>
          <Button onClick={onDeleteEdge} size="sm" variant="ghost">
            <Icon icon={Delete01Icon} className="size-4" />
            Delete
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label>Branch</Label>
          <Select
            items={[
              { value: "", label: "Default" },
              { value: "next", label: "next" },
              { value: "timeout", label: "timeout" },
              { value: "true", label: "true" },
              { value: "false", label: "false" },
            ]}
            value={currentBranch}
            onValueChange={(value) =>
              onUpdateEdgeBranch(isWorkflowBranch(value) ? value : undefined)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Default</SelectItem>
              <SelectItem value="next">next</SelectItem>
              <SelectItem value="timeout">timeout</SelectItem>
              <SelectItem value="true">true</SelectItem>
              <SelectItem value="false">false</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  const isTrigger = selectedNode?.data.type === "trigger";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="space-y-1">
          <h3 className="font-medium">
            {isTrigger ? "Trigger" : "Action"} settings
          </h3>
          <Badge variant="outline">{selectedNode?.id}</Badge>
        </div>
        {!isTrigger ? (
          <Button onClick={onDeleteNode} size="sm" variant="ghost">
            <Icon icon={Delete01Icon} className="size-4" />
            Delete
          </Button>
        ) : null}
      </div>

      <div className="border-b px-4 py-2">
        <div className="flex gap-2">
          <Button
            onClick={() => setActiveTab("properties")}
            size="sm"
            variant={activeTab === "properties" ? "secondary" : "ghost"}
          >
            Properties
          </Button>
          <Button
            onClick={() => setActiveTab("raw")}
            size="sm"
            variant={activeTab === "raw" ? "secondary" : "ghost"}
          >
            Raw
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
        {activeTab === "properties" ? (
          <>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={selectedNode?.data.label ?? ""}
                onChange={(event) =>
                  onUpdateNode((node) => ({
                    ...node,
                    data: {
                      ...node.data,
                      label: event.target.value,
                    },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={selectedNode?.data.description ?? ""}
                onChange={(event) =>
                  onUpdateNode((node) => ({
                    ...node,
                    data: {
                      ...node.data,
                      description: event.target.value,
                    },
                  }))
                }
              />
            </div>

            {isTrigger ? (
              <TriggerConfig
                config={selectedNodeConfig}
                onChange={(config) =>
                  onUpdateNode((node) => ({
                    ...node,
                    data: {
                      ...node.data,
                      config,
                    },
                  }))
                }
              />
            ) : getActionType(selectedNodeConfig) === "Condition" ? (
              <ConditionConfig
                guard={selectedNodeConfig.guard}
                onChange={(guard) =>
                  onUpdateNode((node) => ({
                    ...node,
                    data: {
                      ...node.data,
                      config: {
                        ...selectedNodeConfig,
                        guard,
                      },
                    },
                  }))
                }
              />
            ) : (
              <ActionConfig
                actions={actions}
                config={selectedNodeConfig}
                onChange={(config) =>
                  onUpdateNode((node) => ({
                    ...node,
                    data: {
                      ...node.data,
                      config,
                      label:
                        typeof config.actionType === "string"
                          ? config.actionType
                          : node.data.label,
                    },
                  }))
                }
              />
            )}
          </>
        ) : (
          <div className="space-y-1.5">
            <Label>Config JSON</Label>
            <Textarea
              rows={14}
              value={JSON.stringify(selectedNodeConfig, null, 2)}
              onChange={(event) => {
                try {
                  const parsed = JSON.parse(event.target.value);
                  if (isRecord(parsed)) {
                    onUpdateNode((node) => ({
                      ...node,
                      data: {
                        ...node.data,
                        config: parsed,
                      },
                    }));
                  }
                } catch {
                  // Keep typing until valid JSON.
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
